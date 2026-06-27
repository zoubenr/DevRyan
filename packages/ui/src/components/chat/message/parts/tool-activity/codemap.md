# packages/ui/src/components/chat/message/parts/tool-activity/

## Responsibility
Renders tool-execution activity rows within chat message parts.

## Design
Part-specific subcomponents isolate tool status formatting and incremental updates.

## Flow
Message-part data enters from chat store; components map tool events to badges/log snippets.

## Integration
Mounted by chat/message/parts and fed by sync/store event pipelines.
