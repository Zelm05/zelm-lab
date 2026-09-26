-- 照片墙初始数据（18 张，路径 = Supabase photos 桶内文件名）
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-seed-photos.sql
-- 幂等：先清空再插入（只影响 photos 表）
DELETE FROM photos;
INSERT INTO photos (title, storage_path, sort_order, created_at) VALUES
  ('photo-01', 'photo-01.webp', 0, 1758787200000),
  ('photo-02', 'photo-02.webp', 1, 1758787200001),
  ('photo-03', 'photo-03.webp', 2, 1758787200002),
  ('photo-04', 'photo-04.webp', 3, 1758787200003),
  ('photo-05', 'photo-05.webp', 4, 1758787200004),
  ('photo-06', 'photo-06.webp', 5, 1758787200005),
  ('photo-07', 'photo-07.webp', 6, 1758787200006),
  ('photo-08', 'photo-08.webp', 7, 1758787200007),
  ('photo-09', 'photo-09.webp', 8, 1758787200008),
  ('photo-10', 'photo-10.webp', 9, 1758787200009),
  ('photo-11', 'photo-11.webp', 10, 1758787200010),
  ('photo-12', 'photo-12.webp', 11, 1758787200011),
  ('photo-13', 'photo-13.webp', 12, 1758787200012),
  ('photo-14', 'photo-14.webp', 13, 1758787200013),
  ('photo-15', 'photo-15.webp', 14, 1758787200014),
  ('photo-16', 'photo-16.webp', 15, 1758787200015),
  ('photo-17', 'photo-17.webp', 16, 1758787200016),
  ('photo-18', 'photo-18.webp', 17, 1758787200017);
