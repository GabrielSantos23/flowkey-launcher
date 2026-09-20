import React, { useEffect, useState } from 'react';
import { feedbackViewState } from './feedbackState';
import { feedbackSubmitService } from '../../services/feedback/feedbackSubmitService';
import { authService } from '../../services/auth/authService';
import { feedbackService } from '../../services/feedback/feedbackService';

import TabGroup from '../../components/base/TabGroup';
import { Input, Textarea } from '../../components/base/TextControls';
import { Button } from '../../components/react/Buttons';

export default function FeedbackDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const categories = [
    { id: 'idea', label: 'Idea' },
    { id: 'bug', label: 'Bug' },
    { id: 'other', label: 'Other' },
  ];

  useEffect(() => {
    if (authService.user?.email) {
      feedbackViewState.email = authService.user.email;
      rerender();
    }
  }, []);

  const submit = async () => {
    if (!feedbackViewState.canSubmit) return;
    feedbackViewState.submitting = true;
    rerender();
    try {
      await feedbackSubmitService.submit(feedbackViewState.toInput());
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'success',
        retryable: false,
        context: { message: 'Feedback sent — thank you!' },
      });
      feedbackViewState.reset();
    } catch (e) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: 'Failed to send feedback. Please try again.' },
        developerDetail: String(e),
      });
    } finally {
      feedbackViewState.submitting = false;
      rerender();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-4 p-5 overflow-y-auto flex-1">
        <TabGroup
          variant="pills"
          tabs={categories}
          activeTab={feedbackViewState.category}
          onChange={(cat) => {
            feedbackViewState.category = cat as 'idea' | 'bug' | 'other';
            rerender();
          }}
        />

        <Textarea
          placeholder={"Tell us what's on your mind…"}
          rows={6}
          value={feedbackViewState.message}
          onChange={(val) => {
            feedbackViewState.message = val;
            rerender();
          }}
        />

        <Input
          placeholder={'Email (optional — or clear to send anonymously)'}
          value={feedbackViewState.email}
          onChange={(val) => {
            feedbackViewState.email = val;
            rerender();
          }}
        />

        <div className="flex justify-end">
          <Button onClick={() => void submit()} disabled={!feedbackViewState.canSubmit}>
            {'Send Feedback'}
          </Button>
        </div>
      </div>
    </div>
  );
}
