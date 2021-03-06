import React from 'react'
import PropTypes from 'prop-types'

import styles from './BlacklistTable.css'

const BlacklistTable = ({ children }) => (
    <div>
        <div className={styles.toolbar} />
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <tbody>{children}</tbody>
            </table>
        </div>
    </div>
)

BlacklistTable.propTypes = {
    children: PropTypes.arrayOf(PropTypes.node).isRequired,
}

export default BlacklistTable
