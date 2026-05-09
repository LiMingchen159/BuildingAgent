# Web UI Plan

## Requirement

The Web UI is the first product interface. It must be authenticated and must not use Streamlit.

## Candidate Stacks

### assistant-ui

Good fit for chat-centric React interfaces. It can accelerate the chat workspace while leaving project/auth/settings pages to custom Next.js code.

### CopilotKit

Useful for embedding copilots into existing applications. It may be heavier than needed if BuildingAgent owns the whole product interface.

### AG-UI

Relevant for agent UI event protocols and streaming interaction patterns. It should be watched for runtime/UI event alignment.

### Custom Next.js UI

Best control over auth, project dashboard, settings, and audit surfaces. More work, but less early lock-in.

## MVP Recommendation

Use Next.js as the Web app foundation. Evaluate assistant-ui for the chat workspace once runtime event contracts are clearer. Avoid heavy frontend dependency lock-in in M001.

## Required Pages

- Login/Register
- Project dashboard
- Project selector
- Chat workspace
- Skills manager
- Model/provider settings
- Tool settings
- Data source settings
- User and permission settings
- Memory/conversation history
- Audit log page
