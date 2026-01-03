-- Verification Script
-- Run this after migrations to verify your database setup is correct

-- ============================================
-- 1. Check Tables Exist
-- ============================================
SELECT 
  'Tables Check' as check_type,
  table_name,
  CASE 
    WHEN table_name IN ('user_tables', 'extracted_rows') THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('user_tables', 'extracted_rows')
ORDER BY table_name;

-- ============================================
-- 2. Check RLS is Enabled
-- ============================================
SELECT 
  'RLS Check' as check_type,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✓ Enabled'
    ELSE '✗ Disabled'
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('user_tables', 'extracted_rows')
ORDER BY tablename;

-- ============================================
-- 3. Check Policies Exist
-- ============================================
SELECT 
  'Policy Check' as check_type,
  tablename,
  policyname,
  CASE 
    WHEN policyname IS NOT NULL THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('user_tables', 'extracted_rows')
ORDER BY tablename, policyname;

-- ============================================
-- 4. Check Indexes Exist
-- ============================================
SELECT 
  'Index Check' as check_type,
  tablename,
  indexname,
  CASE 
    WHEN indexname IS NOT NULL THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('user_tables', 'extracted_rows')
ORDER BY tablename, indexname;

-- ============================================
-- 5. Check Triggers Exist
-- ============================================
SELECT 
  'Trigger Check' as check_type,
  event_object_table as tablename,
  trigger_name,
  CASE 
    WHEN trigger_name IS NOT NULL THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('user_tables', 'extracted_rows')
ORDER BY event_object_table, trigger_name;

-- ============================================
-- 6. Check Function Exists
-- ============================================
SELECT 
  'Function Check' as check_type,
  routine_name,
  CASE 
    WHEN routine_name = 'set_updated_at' THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'set_updated_at';

-- ============================================
-- 7. Summary
-- ============================================
SELECT 
  'Summary' as check_type,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('user_tables', 'extracted_rows')) as tables_count,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('user_tables', 'extracted_rows')) as policies_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('user_tables', 'extracted_rows')) as indexes_count,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE event_object_schema = 'public' AND event_object_table IN ('user_tables', 'extracted_rows')) as triggers_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('user_tables', 'extracted_rows')) = 2
     AND (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('user_tables', 'extracted_rows')) >= 8
     AND (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('user_tables', 'extracted_rows')) >= 4
     AND (SELECT COUNT(*) FROM information_schema.triggers WHERE event_object_schema = 'public' AND event_object_table IN ('user_tables', 'extracted_rows')) = 2
    THEN '✓ Setup Complete'
    ELSE '✗ Setup Incomplete - Check individual checks above'
  END as overall_status;

