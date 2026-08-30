use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct McpNameCmd {
    pub name: String,
    pub command: String,
}

pub(crate) fn names_in_mcp_json(text: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(obj) = value.as_object() else {
        return Vec::new();
    };
    if let Some(servers) = obj.get("servers").and_then(|v| v.as_array()) {
        return servers
            .iter()
            .filter_map(|entry| entry.get("name").and_then(|n| n.as_str()))
            .map(str::to_string)
            .collect();
    }
    if let Some(mcp_servers) = obj.get("mcpServers").and_then(|v| v.as_object()) {
        return mcp_servers.keys().cloned().collect();
    }
    Vec::new()
}

pub(crate) fn first_open_union(
    canonical: &[McpNameCmd],
    live: &[McpNameCmd],
) -> (Vec<McpNameCmd>, Vec<String>) {
    let mut next = canonical.to_vec();
    let mut conflicts = Vec::new();

    for row in live {
        match next.iter().find(|c| c.name == row.name) {
            None => next.push(row.clone()),
            Some(existing) if existing.command == row.command => {}
            Some(_) => conflicts.push(row.name.clone()),
        }
    }

    (next, conflicts)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(name: &str, command: &str) -> McpNameCmd {
        McpNameCmd {
            name: name.into(),
            command: command.into(),
        }
    }

    #[test]
    fn unions_missing_live_rows_into_empty_canonical() {
        let live = vec![row("git", "uvx"), row("docs", "https://x")];
        let (next, conflicts) = first_open_union(&[], &live);
        assert_eq!(next, live);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn skips_same_name_and_command() {
        let canonical = vec![row("git", "uvx")];
        let live = vec![row("git", "uvx")];
        let (next, conflicts) = first_open_union(&canonical, &live);
        assert_eq!(next, canonical);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn keeps_canonical_on_command_conflict() {
        let canonical = vec![row("git", "uvx")];
        let live = vec![row("git", "npx")];
        let (next, conflicts) = first_open_union(&canonical, &live);
        assert_eq!(next, canonical);
        assert_eq!(conflicts, vec!["git".to_string()]);
    }

    #[test]
    fn appends_missing_and_reports_conflicts_without_mutating_inputs() {
        let canonical = vec![row("git", "uvx"), row("docs", "https://x")];
        let live = vec![row("git", "npx"), row("new", "cmd")];
        let canonical_before = canonical.clone();
        let live_before = live.clone();

        let (next, conflicts) = first_open_union(&canonical, &live);

        assert_eq!(canonical, canonical_before);
        assert_eq!(live, live_before);
        assert_eq!(
            next,
            vec![
                row("git", "uvx"),
                row("docs", "https://x"),
                row("new", "cmd"),
            ]
        );
        assert_eq!(conflicts, vec!["git".to_string()]);
    }
}
