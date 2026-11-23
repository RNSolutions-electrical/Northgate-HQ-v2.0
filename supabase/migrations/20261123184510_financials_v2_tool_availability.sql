-- Keep Financials V2 behind the existing Jobs tool availability control.
INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key) VALUES
 ('table','job_financial_v2_records','jobs'),
 ('rpc','read_job_financial_v2','jobs'),
 ('rpc','record_job_financial_v2','jobs'),
 ('rpc','finalize_job_financial_v2','jobs')
ON CONFLICT DO NOTHING;
