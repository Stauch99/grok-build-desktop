//! Inject proxy env into ACP children. GUI apps often have no HTTP_PROXY
//! even when the OS (or a local client) is configured for one.

const PROXY_KEYS: &[&str] = &[
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
];

/// Parse `scutil --proxy` text into `http://host:port` when HTTPEnable is on.
pub fn http_proxy_from_scutil(text: &str) -> Option<String> {
    let enabled = dict_i64(text, "HTTPEnable")? == 1;
    if !enabled {
        return None;
    }
    let host = dict_str(text, "HTTPProxy")?;
    let port = dict_i64(text, "HTTPPort").unwrap_or(80);
    if host.is_empty() {
        return None;
    }
    Some(format!("http://{host}:{port}"))
}

fn dict_i64(text: &str, key: &str) -> Option<i64> {
    dict_str(text, key)?.parse().ok()
}

fn dict_str(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let line = line.trim();
        let Some((left, right)) = line.split_once(':') else {
            continue;
        };
        if left.trim() != key {
            continue;
        }
        let value = right
            .trim()
            .trim_matches(|c| c == '"' || c == '\'')
            .to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

pub fn env_has_outbound_proxy(env: impl Fn(&str) -> Option<String>) -> bool {
    [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ]
    .iter()
    .any(|k| env(k).is_some_and(|v| !v.is_empty()))
}

/// Env pairs to set on an ACP child. Existing process env wins; otherwise macOS
/// `scutil --proxy` HTTP proxy is copied into HTTP(S)_PROXY.
pub fn child_proxy_pairs(
    env: impl Fn(&str) -> Option<String>,
    scutil: Option<&str>,
) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = PROXY_KEYS
        .iter()
        .filter_map(|k| {
            env(k)
                .filter(|v| !v.is_empty())
                .map(|v| ((*k).to_string(), v))
        })
        .collect();
    let env_has_proxy = pairs.iter().any(|(k, _)| {
        matches!(
            k.to_ascii_lowercase().as_str(),
            "http_proxy" | "https_proxy" | "all_proxy"
        )
    });
    if env_has_proxy {
        return pairs;
    }
    if let Some(url) = scutil.and_then(http_proxy_from_scutil) {
        pairs.push(("HTTP_PROXY".into(), url.clone()));
        pairs.push(("HTTPS_PROXY".into(), url.clone()));
        pairs.push(("http_proxy".into(), url.clone()));
        pairs.push(("https_proxy".into(), url));
    }
    pairs
}

pub async fn scutil_proxy_text() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let out = tokio::process::Command::new("scutil")
            .arg("--proxy")
            .output()
            .await
            .ok()?;
        if !out.status.success() {
            return None;
        }
        String::from_utf8(out.stdout).ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scutil_http_proxy() {
        let text = "HTTPEnable : 1\n  HTTPProxy : 127.0.0.1\n  HTTPPort : 7890\n";
        assert_eq!(
            http_proxy_from_scutil(text).as_deref(),
            Some("http://127.0.0.1:7890")
        );
        assert_eq!(
            http_proxy_from_scutil("HTTPEnable : 0\nHTTPProxy : 127.0.0.1\n"),
            None
        );
    }

    #[test]
    fn env_wins_over_scutil() {
        let pairs = child_proxy_pairs(
            |k| (k == "HTTP_PROXY").then(|| "http://127.0.0.1:1080".into()),
            Some("HTTPEnable : 1\nHTTPProxy : 10.0.0.1\nHTTPPort : 80\n"),
        );
        assert!(pairs
            .iter()
            .any(|(k, v)| k == "HTTP_PROXY" && v == "http://127.0.0.1:1080"));
        assert!(!pairs.iter().any(|(_, v)| v.contains("10.0.0.1")));
    }

    #[test]
    fn scutil_fills_when_env_empty() {
        let pairs = child_proxy_pairs(
            |_| None,
            Some("HTTPEnable : 1\nHTTPProxy : 127.0.0.1\nHTTPPort : 7890\n"),
        );
        assert!(pairs
            .iter()
            .any(|(k, v)| k == "HTTPS_PROXY" && v == "http://127.0.0.1:7890"));
    }

    #[test]
    fn env_has_outbound_proxy_ignores_no_proxy_only() {
        assert!(!env_has_outbound_proxy(|_| None));
        assert!(env_has_outbound_proxy(
            |k| (k == "https_proxy").then(|| "http://127.0.0.1:1".into())
        ));
        assert!(!env_has_outbound_proxy(
            |k| (k == "NO_PROXY").then(|| "localhost".into())
        ));
    }
}
