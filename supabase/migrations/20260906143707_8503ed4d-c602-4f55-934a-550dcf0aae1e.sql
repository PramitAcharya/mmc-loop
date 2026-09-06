
CREATE POLICY "post images readable" ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');
CREATE POLICY "members upload own post images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "members delete own post images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);
