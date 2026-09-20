//! Per-extension view CSS overrides, injected at serve time.
//!
//! Store extension bundles are minified and live in `$APPDATA/extensions`,
//! outside this repository, so their presentation cannot be edited directly
//! without forking the bundle. Restyling them from the host keeps the CSS
//! version-controlled here and re-applies on every serve, surviving
//! extension updates. An override is presentation-only: it may restyle the
//! classes a bundle already emits, never depend on markup the bundle does
//! not render.

/// Returns the override CSS for an extension view, if one exists.
pub(crate) fn override_css_for(extension_id: &str) -> Option<&'static str> {
    match extension_id {
        "org.asyar.google-translate" => Some(include_str!("ext_overrides/google-translate.css")),
        "org.asyar.emoji" => Some(include_str!("ext_overrides/emoji.css")),
        _ => None,
    }
}

/// Appends the override CSS as a `<style>` immediately before `</head>` so it
/// loads after every stylesheet the bundle ships and wins at equal
/// specificity. Falls back to wrapping the CSS in a new trailing `<head>`
/// block when the document has no closing head tag.
pub(crate) fn inject_ext_override_css(html: Vec<u8>, css: &str) -> Vec<u8> {
    let style = format!("<style id=\"asyar-ext-override\">{}</style>", css);
    let html_str = match String::from_utf8(html) {
        Ok(s) => s,
        Err(e) => return e.into_bytes(),
    };
    let lower = html_str.to_ascii_lowercase();
    if let Some(pos) = lower.rfind("</head>") {
        let mut result = String::with_capacity(html_str.len() + style.len());
        result.push_str(&html_str[..pos]);
        result.push_str(&style);
        result.push_str(&html_str[pos..]);
        result.into_bytes()
    } else {
        let mut result = String::with_capacity(html_str.len() + style.len() + 15);
        result.push_str(&html_str);
        result.push_str("<head>");
        result.push_str(&style);
        result.push_str("</head>");
        result.into_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::{inject_ext_override_css, override_css_for};

    #[test]
    fn known_extensions_have_overrides() {
        assert!(override_css_for("org.asyar.google-translate").is_some());
        assert!(override_css_for("org.asyar.emoji").is_some());
        assert!(override_css_for("org.asyar.unknown").is_none());
    }

    #[test]
    fn override_css_lands_before_closing_head() {
        let html = b"<html><head><link rel=\"stylesheet\"></head><body></body></html>";
        let result = inject_ext_override_css(html.to_vec(), ".x{color:red}");
        let s = String::from_utf8(result).unwrap();
        let css_pos = s
            .find("asyar-ext-override")
            .expect("override style present");
        let link_pos = s.find("rel=\"stylesheet\"").expect("bundle css present");
        let head_end = s.find("</head>").expect("</head> present");
        assert!(link_pos < css_pos && css_pos < head_end);
    }

    #[test]
    fn override_css_appended_when_head_absent() {
        let html = b"<html><body>content</body></html>";
        let result = inject_ext_override_css(html.to_vec(), ".x{color:red}");
        let s = String::from_utf8(result).unwrap();
        assert!(
            s.ends_with("<head><style id=\"asyar-ext-override\">.x{color:red}</style></head>"),
            "override must be appended in a trailing head block, got: {}",
            s
        );
    }
}
