-- =============================================================
-- Stayloop V5 — sample listings seed
--
-- Run AFTER 20260509_v5_schema.sql.
-- Creates a demo landlord ("Sarah Wang") and 12 realistic Toronto
-- listings matching the V5 design (King West / Liberty Village /
-- CityPlace etc.). Idempotent — uses fixed UUIDs and ON CONFLICT.
-- =============================================================

-- 1) Demo landlord
insert into public.landlords (id, auth_id, email, full_name, plan)
values
  ('00000000-0000-0000-0000-000000000001', null, 'demo-landlord@stayloop.ai', 'Sarah Wang (Demo)', 'pro')
on conflict (id) do update set full_name = excluded.full_name, plan = excluded.plan;

-- 2) Listings — pin_x / pin_y are percentages on the map widget
insert into public.listings (
  id, landlord_id, slug, address, unit, city, province,
  monthly_rent, bedrooms, bathrooms, sqft, has_den, neighborhood,
  trust_tier, pet_policy, amenities, pin_x, pin_y,
  thumb_a, thumb_b, luna_note, badge, photo_count, is_active
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'king1207-100-western-battery',
    '100 Western Battery Rd', '1207', 'Toronto', 'ON',
    2850, 1, 1.5, 700, true, 'King West Village',
    3, 'cats', array['允许猫','包暖+水','车位'],
    42, 18,
    '#D4C4A8', '#94815C',
    '<b>Sarah Wang</b> 是这套的房东 · 你的 Profile 已经达到她的 Tier 门槛 · <b>建议直接申请</b>',
    'LUNA · 92% 匹配', 32, true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'liberty305-88-lynn-williams',
    '88 Lynn Williams St', '305', 'Toronto', 'ON',
    2500, 1, 1.0, 650, true, 'Liberty Village',
    2, 'cats', array['允许猫','健身房'],
    28, 32,
    '#B8A586', '#7A6745',
    '你三周前看过这套 · <b>降价了 $150</b> · 要再去看一次？',
    'LUNA · 88% 匹配', 24, true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'wellington802-270',
    '270 Wellington St W', '802', 'Toronto', 'ON',
    2750, 1, 1.0, 680, true, 'King West',
    2, 'cats', array['允许猫','包水电','阳台'],
    55, 24,
    '#C9B392', '#8A7758',
    '6 小时前刚上 · 已收到 3 个看房意向 · <b>建议今晚约看房</b>',
    'NEW · 6h', 28, true
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'niagara87-155',
    '155 Niagara St', '87', 'Toronto', 'ON',
    2690, 1, 1.0, 620, false, 'Niagara',
    2, 'cats', array['允许猫','包暖'],
    38, 48,
    '#A89677', '#6E5E42',
    '通勤跟你看过的 King 805 一样（14 分钟 TTC）· 但少了 den',
    'LUNA · 78% 匹配', 20, true
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'fleet4f-600',
    '600 Fleet St', '4F', 'Toronto', 'ON',
    2795, 1, 1.0, 695, true, 'King West Village',
    2, 'cats', array['允许猫','阳台','健身房'],
    62, 38,
    '#D4C4A8', '#94815C',
    '你 5/9 看过 · 给了 3.5 星 · <b>顾虑：楼下吵</b>',
    '已看过', 32, true
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    'iceboat1502-21',
    '21 Iceboat Terr', '1502', 'Toronto', 'ON',
    2895, 1, 1.5, 720, true, 'CityPlace',
    3, 'cats', array['允许猫','湖景'],
    50, 58,
    '#B59B7A', '#80694A',
    '房东是机构 · 申请走标准流程 · <b>你的 Tier 3 已达门槛</b>',
    'NEW · 1d', 30, true
  ),
  (
    '10000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000001',
    'queen1162e-7',
    '1162 Queen St E', '7', 'Toronto', 'ON',
    3100, 2, 1.0, 760, false, 'Leslieville',
    2, 'both', array['允许猫狗','屋顶花园','街车'],
    70, 14,
    '#6EE7B7', '#047857',
    '楼上是天台花园 · 适合养狗 · <b>步行 2min 到 Queen 街车</b>',
    'VERIFIED', 22, true
  ),
  (
    '10000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000001',
    'sumach1b-210',
    '210 Sumach St', '1B', 'Toronto', 'ON',
    1680, 0, 1.0, 380, false, 'Cabbagetown',
    1, 'cats', array['允许猫','包水电','阳台'],
    24, 62,
    '#FDBA74', '#EA580C',
    '你 4 月 28 日告诉我预算 < $1,800 · 这套刚降到 $1,680',
    'PRICE DROP', 14, true
  ),
  (
    '10000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000001',
    'distillery1207-46',
    '46 Distillery Ln', '1207', 'Toronto', 'ON',
    3680, 1, 1.0, 690, false, 'Distillery District',
    4, 'cats', array['允许猫','车位','concierge','健身房'],
    46, 72,
    '#93C5FD', '#1E3A8A',
    'Tier 4 房源 · 房东要求完整信用 + 法庭记录 · <b>升级 Passport 即可申请</b>',
    'TIER 4', 28, true
  ),
  (
    '10000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000001',
    'brunswick432',
    '432 Brunswick Ave', null, 'Toronto', 'ON',
    4250, 3, 2.0, 1380, false, 'The Annex',
    3, 'both', array['允许猫狗','车位','花园'],
    18, 28,
    '#D4C4A8', '#94815C',
    '整套 Victorian · 适合家庭 · 步行 4min 到 Bloor 地铁',
    'LUNA · 75% 匹配', 18, true
  ),
  (
    '10000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-000000000001',
    'harbour4502-88',
    '88 Harbour St', '4502', 'Toronto', 'ON',
    3450, 2, 2.0, 845, false, 'Harbourfront',
    3, 'cats', array['允许猫','车位','concierge','湖景'],
    72, 54,
    '#7C3AED', '#2563EB',
    '<b>Sarah Wang</b> 房东 · 45 楼湖景 · <b>可议租期</b>',
    'LUNA · 96% 匹配', 24, true
  ),
  (
    '10000000-0000-0000-0000-00000000000c',
    '00000000-0000-0000-0000-000000000001',
    'hanna312-15',
    '15 Hanna Ave', '312', 'Toronto', 'ON',
    2890, 1, 1.0, 720, false, 'Liberty Village',
    2, 'both', array['允许猫狗','阁楼','健身房'],
    60, 78,
    '#047857', '#10B981',
    '125 年改造仓库 loft · 步行 3min 到 King 车站',
    'NEW · 2h', 26, true
  )
on conflict (id) do update set
  monthly_rent = excluded.monthly_rent,
  bedrooms     = excluded.bedrooms,
  bathrooms    = excluded.bathrooms,
  sqft         = excluded.sqft,
  has_den      = excluded.has_den,
  neighborhood = excluded.neighborhood,
  trust_tier   = excluded.trust_tier,
  pet_policy   = excluded.pet_policy,
  amenities    = excluded.amenities,
  pin_x        = excluded.pin_x,
  pin_y        = excluded.pin_y,
  thumb_a      = excluded.thumb_a,
  thumb_b      = excluded.thumb_b,
  luna_note    = excluded.luna_note,
  badge        = excluded.badge,
  photo_count  = excluded.photo_count,
  is_active    = excluded.is_active;
