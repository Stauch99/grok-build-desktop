use serde::Serialize;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDoctorDto {
    pub agent_id: String,
    pub binary: Option<String>,
    pub version: Option<String>,
    pub home: String,
    pub auth_present: bool,
    pub auth_kind: String,
    pub acp_spawn_ok: bool,
    pub login_hint: Vec<String>,
}

pub(crate) fn doctor_from_evidence(
    agent_id: &str,
    home: String,
    has_subscription: bool,
    has_api_key: bool,
    binary: Option<String>,
    acp_spawn_ok: bool,
) -> AgentDoctorDto {
    let kind = classify_auth(has_subscription, has_api_key);
    AgentDoctorDto {
        agent_id: agent_id.to_string(),
        binary,
        version: None,
        home,
        auth_present: has_subscription || has_api_key,
        auth_kind: auth_kind_str(kind).to_string(),
        acp_spawn_ok,
        login_hint: vec!["login".into()],
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
            true,
        );
        assert_eq!(d.auth_kind, "api");
        assert!(d.auth_present);
        assert_eq!(d.home, "/Users/me/.claude");
        let n = doctor_from_evidence("grok", "/Users/me/.grok".into(), false, false, None, false);
        assert_eq!(n.auth_kind, "none");
        assert!(!n.auth_present);
    }

    #[test]
    fn subscription_only() {
        assert_eq!(
            classify_auth(true, false),
            AuthKind::Subscription
        );
        let d = doctor_from_evidence("grok", "/home/.grok".into(), true, false, None, false);
        assert_eq!(d.auth_kind, "subscription");
        assert!(d.auth_present);
    }

    #[test]
    fn dto_serializes_camel_case() {
        let d = doctor_from_evidence("grok", "/home/.grok".into(), false, false, None, false);
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["agentId"], "grok");
        assert_eq!(json["authKind"], "none");
        assert_eq!(json["authPresent"], false);
        assert_eq!(json["acpSpawnOk"], false);
        assert_eq!(json["loginHint"], serde_json::json!(["login"]));
    }
}
