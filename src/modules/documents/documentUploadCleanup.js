export async function archiveFailedDocument(client, documentId, reason) {
  const { error } = await client.rpc('archive_failed_document_upload', {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (error) {
    throw new Error(`${reason}. Document cleanup could not be confirmed: ${error.message}. Refresh Documents before retrying.`);
  }
}
