-- tenant-files: 10MB → 25MB，并放行 iPhone 的 HEIC/HEIF（2026-08-25）
--
-- 手机端实测反馈:用手机拍一张工资单/银行流水,现代 iPhone/Android 出片常年
-- 4–12MB,而这个桶卡在 10MB,前端只能弹一句「超过 10 MB」——landlord 站在房子里
-- 拿着手机,没有任何出路。
--
-- 另一半问题是 allowed_mime_types 里没有 HEIC/HEIF。iOS 相册默认就是 HEIC,
-- 从「文件」里选原图会被桶直接拒掉。
--
-- 注意:模型侧还有一个**更小**的限制——screen-score 与取证 OCR 都是把图片
-- 按 URL 交给模型,各家对抓取的图片约束在 ~5MB。所以图片在前端会先被
-- 降采样(lib/screening/prepareUpload.ts,长边 2600px / JPEG q0.85),这里的
-- 25MB 主要是给扫描版多页 PDF 留的余量。PDF 一律不重编码——取证靠的就是
-- PDF 的 producer/对象结构/增量更新痕迹。
update storage.buckets
set file_size_limit = 25 * 1024 * 1024,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
      'image/heic', 'image/heif',
      'application/pdf'
    ]
where id = 'tenant-files';
