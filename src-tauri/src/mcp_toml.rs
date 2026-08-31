use toml_edit::{Array, DocumentMut, Item, Table};

fn ensure_table<'a>(doc: &'a mut DocumentMut, key: &str) -> &'a mut Table {
    if !doc.contains_key(key) {
        doc[key] = Item::Table(Table::new());
    }
    doc[key].as_table_mut().expect("table")
}

pub(crate) fn upsert_mcp_servers_toml(
    text: &str,
    name: &str,
    command: &str,
    args: &[String],
) -> String {
    let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
    let mcp_servers = ensure_table(&mut doc, "mcp_servers");
    if !mcp_servers.contains_key(name) {
        mcp_servers[name] = Item::Table(Table::new());
    }
    let server = mcp_servers[name].as_table_mut().expect("server table");
    server.insert("command", toml_edit::value(command));
    let mut arr = Array::new();
    for arg in args {
        arr.push(arg.as_str());
    }
    server.insert("args", toml_edit::value(arr));
    doc.to_string()
}

pub(crate) fn remove_mcp_servers_toml(text: &str, name: &str) -> String {
    let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
    if let Some(mcp_servers) = doc.get_mut("mcp_servers").and_then(|i| i.as_table_mut()) {
        mcp_servers.remove(name);
    }
    doc.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upserts_and_removes_mcp_servers_table() {
        let next = upsert_mcp_servers_toml("", "git", "uvx", &["mcp-git".into()]);
        assert!(next.contains("mcp_servers"));
        assert!(next.contains("git"));
        assert!(next.contains("uvx"));
        let kept = upsert_mcp_servers_toml(&next, "docs", "npx", &[]);
        assert!(kept.contains("git"));
        assert!(kept.contains("docs"));
        let gone = remove_mcp_servers_toml(&kept, "git");
        assert!(!gone.contains("git") || gone.contains("docs"));
        assert!(gone.contains("docs"));
    }
}
