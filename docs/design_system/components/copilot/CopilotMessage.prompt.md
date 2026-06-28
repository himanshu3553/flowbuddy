A chat bubble for the embeddable copilot preview — shows grounded answers (with a citation) and honest declines.

```jsx
<CopilotMessage from="user">How do I reset a customer's password?</CopilotMessage>
<CopilotMessage from="bot" citation="Reset a password" feedback>
  Open the account menu, go to <b>Security</b>, then click <b>Reset password</b> and confirm.
</CopilotMessage>
<CopilotMessage from="bot" decline>
  I don't have that in my approved sources yet, so I won't guess. I've flagged it for the team.
</CopilotMessage>
```

- `citation` adds the indigo source chip; `decline` adds the red "gap logged" chip; `feedback` shows 👍/👎.
