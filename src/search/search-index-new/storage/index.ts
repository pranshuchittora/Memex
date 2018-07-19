import groupBy from 'lodash/fp/groupBy'
import Dexie from 'dexie'
import 'dexie-mongoify'

import { Page, Visit, Bookmark, Tag, FavIcon } from '../models'
import { StorageManager } from './manager'
import { getDexieHistory } from './dexie-schema'
import { DexieSchema, FilterQuery } from './types'

export * from './types'

export interface Props {
    indexedDB: IDBFactory
    IDBKeyRange: typeof IDBKeyRange
    dbName: string
    storageManager?: StorageManager
    backupTableName?: string
}

export default class Storage extends Dexie {
    private static DEF_PARAMS: Props = {
        indexedDB: null,
        IDBKeyRange: null,
        dbName: 'memex',
        storageManager: null,
    }

    public static DEF_BACKUP_TABLE = 'backupChanges'
    public static MIN_STR = ''
    public static MAX_STR = String.fromCharCode(65535)

    // Quick typings as `dexie-mongoify` doesn't contain any
    public collection: <T>(
        name: string,
    ) => {
        find(query: FilterQuery<T>): Dexie.Collection<T, any>
        count(query: FilterQuery<T>): Promise<number>
        update(
            query: FilterQuery<T>,
            update,
        ): Promise<{ modifiedCount: number }>
        remove(query: FilterQuery<T>): Promise<{ deletedCount: number }>
    }

    public backupTable: string

    /**
     * Represents page data - our main data type.
     */
    public pages: Dexie.Table<Page, string>

    /**
     * Represents page visit timestamp and activity data.
     */
    public visits: Dexie.Table<Visit, [number, string]>

    /**
     * Represents page visit timestamp and activity data.
     */
    public bookmarks: Dexie.Table<Bookmark, string>

    /**
     * Represents tags associated with Pages.
     */
    public tags: Dexie.Table<Tag, [string, string]>

    /**
     * Represents fav-icons associated with hostnames.
     */
    public favIcons: Dexie.Table<FavIcon, string>

    constructor(
        {
            indexedDB,
            IDBKeyRange,
            dbName,
            storageManager,
            backupTableName,
        } = Storage.DEF_PARAMS,
    ) {
        super(dbName || Storage.DEF_PARAMS.dbName, {
            indexedDB: indexedDB || window.indexedDB,
            IDBKeyRange: IDBKeyRange || window['IDBKeyRange'],
        })

        this.backupTable = backupTableName || Storage.DEF_BACKUP_TABLE

        this._initSchema(
            storageManager && getDexieHistory(storageManager.registry),
        )
    }

    /**
     * See docs for explanation of Dexie table schema syntax:
     * http://dexie.org/docs/Version/Version.stores()
     */
    private _initSchema(dexieHistory: DexieSchema[]) {
        dexieHistory = dexieHistory || []
        const baseVersion = 1
        const baseSchema = {
            pages: 'url, *terms, *titleTerms, *urlTerms, domain, hostname',
            visits: '[time+url], url',
            bookmarks: 'url, time',
            tags: '[name+url], name, url',
            favIcons: 'hostname',
        }
        this.version(baseVersion).stores(baseSchema)

        dexieHistory.forEach(({ version, schema, migrations }) => {
            const finalVersion = baseVersion + version
            const finalSchema = Object.assign(baseSchema, schema)
            this.version(finalVersion)
                .stores(finalSchema)
                .upgrade(() => {
                    migrations.forEach(migration => {
                        // TODO: Call migration with some object that allows for data manipulation
                    })
                })
        })

        // Set up model classes
        this.pages.mapToClass(Page)
        this.visits.mapToClass(Visit)
        this.bookmarks.mapToClass(Bookmark)
        this.tags.mapToClass(Tag)
        this.favIcons.mapToClass(FavIcon)
    }

    /**
     * Performs async clearing of each table in succession; don't use unless you want to lose __all your data__
     *
     * @return {Promise<void>}
     */
    public async clearData() {
        for (const table of this.tables) {
            await table.clear()
        }
    }

    /**
     * Overrides `Dexie._createTransaction` to ensure to add `backupChanges` table to any readwrite transaction.
     * This allows us to avoid specifying this table on every single transaction to allow table hooks to write to
     * our change tracking table.
     *
     * TODO: Add clause to condition to check if backups is enabled
     *  (no reason to add this table to all transactions if backups is off)
     */
    private _createTransaction = Dexie.override(
        this._createTransaction,
        origFn => (mode: string, tables: string[], ...args) => {
            if (mode === 'readwrite' && !tables.includes(this.backupTable)) {
                tables = [...tables, this.backupTable]
            }

            return origFn.call(this, mode, tables, ...args)
        },
    )
}
