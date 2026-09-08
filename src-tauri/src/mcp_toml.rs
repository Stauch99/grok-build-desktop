use toml_edit::{Array, DocumentMut, Item, Table};

fn ensure_table<'a>(doc: &'a mut DocumentMut, key: &str) -> Result<&'a mut Table, String> {
    if !doc.contains_key(key) {
        doc[key] = Item::Table(Table::new());
    }
    doc[key]
        .as_table_mut()
        .ok_or_else(|| format!("配置里 {key} 不是表，请先修正 agents 配置文件再试"))
}

pub(crate) fn upsert_mcp_servers_toml(
    text: &str,
    name: &str,
    command: &str,
    args: &[String],
) -> Result<String, String> {
    let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
    let mcp_servers = ensure_table(&mut doc, "mcp_servers")?;
    if !mcp_servers.contains_key(name) {
        mcp_servers[name] = Item::Table(Table::new());
    }
    let server = mcp_servers[name]
        .as_table_mut()
        .ok_or_else(|| format!("mcp_servers.{name} 不是表，请先修正配置文件再试"))?;
    let command = command.trim();
    if command.starts_with("http://") || command.starts_with("https://") {
        server.remove("command");
        server.remove("args");
        server.insert("url", toml_edit::value(command));
    } else {
        server.remove("url");
        server.insert("command", toml_edit::value(command));
        let mut arr = Array::new();
        for arg in args {
            arr.push(arg.as_str());
        }
        server.insert("args", toml_edit::value(arr));
    }
    Ok(doc.to_string())
}

pub(crate) fn remove_mcp_servers_toml(text: &str, name: &str) -> Result<String, String> {
    let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
    if let Some(mcp_servers) = doc.get_mut("mcp_servers").and_then(|i| i.as_table_mut()) {
        mcp_servers.remove(name);
    }
    Ok(doc.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upserts_and_removes_mcp_servers_table() {
        let next = upsert_mcp_servers_toml("", "git", "uvx", &["mcp-git".into()]).unwrap();
        assert!(next.contains("mcp_servers"));
        assert!(next.contains("git"));
        assert!(next.contains("uvx"));
        let kept = upsert_mcp_servers_toml(&next, "docs", "npx", &[]).unwrap();
        assert!(kept.contains("git"));
        assert!(kept.contains("docs"));
        let gone = remove_mcp_servers_toml(&kept, "git").unwrap();
        assert!(!gone.contains("git") || gone.contains("docs"));
        assert!(gone.contains("docs"));
    }

    #[test]
    fn upserts_http_url_as_url_not_stdio_command() {
        let next =
            upsert_mcp_servers_toml("", "paper", "http://127.0.0.1:29979/mcp", &[]).unwrap();
        assert!(next.contains("url"));
        assert!(next.contains("http://127.0.0.1:29979/mcp"));
        assert!(!next.contains("command"));
        let mixed = upsert_mcp_servers_toml(&next, "git", "uvx", &["mcp-git".into()]).unwrap();
        assert!(mixed.contains("uvx"));
        assert!(mixed.contains("http://127.0.0.1:29979/mcp"));
        let flipped = upsert_mcp_servers_toml(&mixed, "paper", "uvx", &["paper-mcp".into()])
            .unwrap();
        assert!(flipped.contains("command"));
        let paper = flipped.split("[mcp_servers.paper]").nth(1).unwrap_or("");
        assert!(paper.contains("command"));
        assert!(!paper.contains("url"));
    }

    #[test]
    fn rejects_scalar_mcp_servers_instead_of_panicking() {
        let err = upsert_mcp_servers_toml("mcp_servers = 5", "git", "uvx", &[]);
        assert!(err.is_err());
        let err = upsert_mcp_servers_toml("[mcp_servers]\ngit = \"x\"", "git", "uvx", &[]);
        assert!(err.is_err());
    }
}
