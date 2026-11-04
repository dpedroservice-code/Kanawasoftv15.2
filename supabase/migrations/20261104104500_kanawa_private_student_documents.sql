-- Private document storage for student identification documents.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('kanawa-private-documents','kanawa-private-documents',false,3145728,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=3145728,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS kanawa_student_docs_read ON storage.objects;
CREATE POLICY kanawa_student_docs_read ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id='kanawa-private-documents' AND
  private.ks_has_company_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','manager']::text[]));

DROP POLICY IF EXISTS kanawa_student_docs_insert ON storage.objects;
CREATE POLICY kanawa_student_docs_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id='kanawa-private-documents' AND
  private.ks_has_company_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','manager']::text[]));

DROP POLICY IF EXISTS kanawa_student_docs_update ON storage.objects;
CREATE POLICY kanawa_student_docs_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id='kanawa-private-documents' AND
  private.ks_has_company_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','manager']::text[]))
WITH CHECK (bucket_id='kanawa-private-documents' AND
  private.ks_has_company_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','manager']::text[]));

DROP POLICY IF EXISTS kanawa_student_docs_delete ON storage.objects;
CREATE POLICY kanawa_student_docs_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id='kanawa-private-documents' AND
  private.ks_has_company_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','manager']::text[]));
