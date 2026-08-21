-- service_role bypasses RLS policies but still needs base object privileges (GRANT) to touch a
-- table at all. A bare `create table` doesn't grant these automatically. See specs/01-data-model.md.
grant select, insert, update, delete on
  documents, document_chunks, conversations, messages, leads
to service_role;
