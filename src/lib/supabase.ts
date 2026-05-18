import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xfialzrbbsdzzcjtefqo.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmaWFsenJiYnNkenpjanRlZnFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjQzMzgsImV4cCI6MjA5NDY0MDMzOH0.QrmJRU5HSwUzJvVH-iPLGLXiR2GZbwnAgMWYieJrlQA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
