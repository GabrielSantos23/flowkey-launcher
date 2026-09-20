use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnboardingStep {
    Welcome,
    SummonSearch,
    Clipboard,
    Portals,
    HiddenCommands,
    Emoji,
    Snippets,
    PrivacyConsent,
    CheatSheet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingState {
    pub current: OnboardingStep,
    pub total: u8,
    pub position: u8, // 1-indexed for display
    pub is_macos: bool,
}

pub fn step_order() -> Vec<OnboardingStep> {
    vec![
        OnboardingStep::Welcome,
        OnboardingStep::SummonSearch,
        OnboardingStep::Clipboard,
        OnboardingStep::Portals,
        OnboardingStep::HiddenCommands,
        OnboardingStep::Emoji,
        OnboardingStep::Snippets,
        OnboardingStep::PrivacyConsent,
        OnboardingStep::CheatSheet,
    ]
}

pub fn initial() -> OnboardingState {
    let order = step_order();
    OnboardingState {
        current: order[0],
        total: order.len() as u8,
        position: 1,
        is_macos: false,
    }
}

pub fn advance(state: OnboardingState) -> OnboardingState {
    let order = step_order();
    let idx = order.iter().position(|s| *s == state.current).unwrap_or(0);
    let next_idx = (idx + 1).min(order.len() - 1);
    OnboardingState {
        current: order[next_idx],
        total: order.len() as u8,
        position: (next_idx + 1) as u8,
        is_macos: false,
    }
}

pub fn go_back(state: OnboardingState) -> OnboardingState {
    let order = step_order();
    let idx = order.iter().position(|s| *s == state.current).unwrap_or(0);
    let prev_idx = idx.saturating_sub(1);
    OnboardingState {
        current: order[prev_idx],
        total: order.len() as u8,
        position: (prev_idx + 1) as u8,
        is_macos: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXPECTED: [OnboardingStep; 9] = [
        OnboardingStep::Welcome,
        OnboardingStep::SummonSearch,
        OnboardingStep::Clipboard,
        OnboardingStep::Portals,
        OnboardingStep::HiddenCommands,
        OnboardingStep::Emoji,
        OnboardingStep::Snippets,
        OnboardingStep::PrivacyConsent,
        OnboardingStep::CheatSheet,
    ];

    #[test]
    fn order_has_nine_steps() {
        assert_eq!(step_order().len(), 9);
        assert_eq!(step_order(), EXPECTED.to_vec());
    }

    #[test]
    fn text_expansion_cluster_is_contiguous() {
        let order = step_order();
        let emoji = order
            .iter()
            .position(|s| *s == OnboardingStep::Emoji)
            .unwrap();
        let snippets = order
            .iter()
            .position(|s| *s == OnboardingStep::Snippets)
            .unwrap();
        assert_eq!(snippets, emoji + 1);
    }

    #[test]
    fn initial_starts_at_welcome_position_one() {
        let s = initial();
        assert_eq!(s.current, OnboardingStep::Welcome);
        assert_eq!(s.position, 1);
        assert_eq!(s.total, 9);
        assert!(!s.is_macos);
    }

    #[test]
    fn advance_moves_one_step() {
        let s = advance(initial());
        assert_eq!(s.current, OnboardingStep::SummonSearch);
        assert_eq!(s.position, 2);
    }

    #[test]
    fn advance_at_last_stays_last() {
        let mut s = initial();
        for _ in 0..20 {
            s = advance(s);
        }
        assert_eq!(s.current, OnboardingStep::CheatSheet);
        assert_eq!(s.position, s.total);
    }

    #[test]
    fn go_back_at_welcome_stays_welcome() {
        let s = go_back(initial());
        assert_eq!(s.current, OnboardingStep::Welcome);
        assert_eq!(s.position, 1);
    }

    #[test]
    fn go_back_after_advance_returns() {
        let s = go_back(advance(initial()));
        assert_eq!(s.current, OnboardingStep::Welcome);
        assert_eq!(s.position, 1);
    }
}
