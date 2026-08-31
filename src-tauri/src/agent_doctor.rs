use std::path::Path;

use serde::Serialize;

pub(crate) fn nonempty_auth_file(path: &Path) -> bool {
    path.is_file() && path.metadata().map(|m| m.len() > 0).unwrap_or(false)
}

/** Kimi stores OAuth under credentials/kimi-code.json, not auth.json. */
pub(crate) fn kimi_subscription_present(home: &Path) -> bool {
    nonempty_auth_file(&home.join("auth.json"))
        || nonempty_auth_file(&home.join("credentials").join("kimi-code.json"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthKind {
    Subscription,
    Api,
    None,
}

pub(crate) fn classify_auth(has_subscription: bool, has_api_key: bool) -> AuthKind {
    if has_api_key {
        AuthKind::Api
    } else if has_subscription {
        AuthKind::Subscription
    } else {
        AuthKind::None
    }
}

fn auth_kind_str(kind: AuthKind) -> &'static str {
    match kind {
        AuthKind::Api => "api",
        AuthKind::Subscription => "subscription",
        AuthKind::None => "none",
    }
}

pub(crate) fn login_hint_for(agent_id: &str) -> Vec<String> {
    match agent_id {
        "grok" => vec!["grok auth login".into()],
        "kimi" => vec!["kimi login".into()],
        "claude" => vec!["claude auth login".into()],
        "codex" => vec!["codex login".into()],
        _ => vec!["login".into()],
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDoctorDto {
    pub agent_id: String,
    pub binary: Option<String>,
    pub version: Option<String>,
    pub home: String,
    pub auth_present: bool,
    pub auth_kind: String,
    pub login_hint: Vec<String>,
}

pub(crate) fn doctor_from_evidence(
    agent_id: &str,
    home: String,
    has_subscription: bool,
    has_api_key: bool,
    binary: Option<String>,
    version: Option<String>,
) -> AgentDoctorDto {
    let kind = classify_auth(has_subscription, has_api_key);
    AgentDoctorDto {
        agent_id: agent_id.to_string(),
        binary,
        version,
        home,
        auth_present: has_subscription || has_api_key,
        auth_kind: auth_kind_str(kind).to_string(),
        login_hint: login_hint_for(agent_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_key_wins() {
        let d = doctor_from_evidence(
            "claude",
            "/Users/me/.claude".into(),
            true,
            true,
            Some("/bin/npx".into()),
            Some("2.1.0".into()),
        );
        assert_eq!(d.auth_kind, "api");
        assert!(d.auth_present);
        assert_eq!(d.home, "/Users/me/.claude");
        assert_eq!(d.binary.as_deref(), Some("/bin/npx"));
        assert_eq!(d.version.as_deref(), Some("2.1.0"));
        let n = doctor_from_evidence("grok", "/Users/me/.grok".into(), false, false, None, None);
        assert_eq!(n.auth_kind, "none");
        assert!(!n.auth_present);
        assert!(n.binary.is_none());
    }

    #[test]
    fn subscription_only() {
        assert_eq!(
            classify_auth(true, false),
            AuthKind::Subscription
        );
        let d = doctor_from_evidence("grok", "/home/.grok".into(), true, false, None, None);
        assert_eq!(d.auth_kind, "subscription");
        assert!(d.auth_present);
    }

    #[test]
    fn kimi_credentials_count_as_subscription() {
        let root = std::env::temp_dir().join(format!("kimi-doctor-{}", std::process::id()));
        let creds = root.join("credentials");
        std::fs::create_dir_all(&creds).unwrap();
        assert!(!kimi_subscription_present(&root));
        std::fs::write(creds.join("kimi-code.json"), "{\"access_token\":\"x\"}").unwrap();
        assert!(kimi_subscription_present(&root));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn login_hint_matches_cli() {
        assert_eq!(login_hint_for("grok"), vec!["grok auth login"]);
        assert_eq!(login_hint_for("kimi"), vec!["kimi login"]);
        assert_eq!(login_hint_for("claude"), vec!["claude auth login"]);
        assert_eq!(login_hint_for("codex"), vec!["codex login"]);
    }

    #[test]
    fn dto_serializes_camel_case() {
        let d = doctor_from_evidence("grok", "/home/.grok".into(), false, false, None, None);
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["agentId"], "grok");
        assert_eq!(json["authKind"], "none");
        assert_eq!(json["authPresent"], false);
        assert!(json.get("acpSpawnOk").is_none());
        assert_eq!(json["loginHint"], serde_json::json!(["grok auth login"]));
        assert_eq!(json["binary"], serde_json::Value::Null);
        assert_eq!(json["version"], serde_json::Value::Null);
    }
}
