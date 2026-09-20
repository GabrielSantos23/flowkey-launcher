//! User favorites for the launcher's root list. A favorite is a pin on a
//! search-index object id (`app_*` / `cmd_*`); pinned items are surfaced as
//! the "Favorites" section at the top of the empty-query result list.
//! Stored in the search index database so favorites and the items they point
//! at share one lifecycle.

use rusqlite::{params, Connection, Result};

pub fn init_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS favorites (
            object_id    TEXT PRIMARY KEY,
            favorited_at INTEGER NOT NULL
        )",
        [],
    )?;
    Ok(())
}

/// Toggle the pin for `object_id`. Returns `true` when the item ends up
/// favorited, `false` when it was removed.
pub fn toggle(conn: &Connection, object_id: &str, now: i64) -> Result<bool> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM favorites WHERE object_id = ?1",
            params![object_id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if exists {
        conn.execute(
            "DELETE FROM favorites WHERE object_id = ?1",
            params![object_id],
        )?;
        Ok(false)
    } else {
        conn.execute(
            "INSERT INTO favorites (object_id, favorited_at) VALUES (?1, ?2)",
            params![object_id, now],
        )?;
        Ok(true)
    }
}

/// Favorited object ids, newest-pinned first.
pub fn list_ids(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT object_id FROM favorites ORDER BY favorited_at DESC")?;
    let rows = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<Vec<_>>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init_table(&c).unwrap();
        c
    }

    #[test]
    fn toggle_inserts_then_removes() {
        let c = open();
        assert!(toggle(&c, "app_safari", 1000).unwrap());
        assert_eq!(list_ids(&c).unwrap(), vec!["app_safari".to_string()]);
        assert!(!toggle(&c, "app_safari", 2000).unwrap());
        assert!(list_ids(&c).unwrap().is_empty());
    }

    #[test]
    fn list_is_newest_first() {
        let c = open();
        toggle(&c, "app_first", 1000).unwrap();
        toggle(&c, "cmd_second", 2000).unwrap();
        assert_eq!(
            list_ids(&c).unwrap(),
            vec!["cmd_second".to_string(), "app_first".to_string()]
        );
    }

    #[test]
    fn init_table_is_idempotent() {
        let c = Connection::open_in_memory().unwrap();
        init_table(&c).unwrap();
        init_table(&c).unwrap();
    }
}
