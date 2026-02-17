class AppConstants {
  // Supabase configuration - same as the web app
  static const String supabaseUrl = 'https://jyjsbbugskbbhibhlyks.supabase.co';
  static const String supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5anNiYnVnc2tiYmhpYmhseWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzgzOTksImV4cCI6MjA4NjQxNDM5OX0.bIv_4bWI4P-turSa-AJ4paMOVU7vkuOveTxQ5CEkK40';

  // Backend API URL - point to your deployed .NET backend
  // Change this to your production API URL when deploying
  static const String apiBaseUrl = 'https://essdesign-production.up.railway.app/api';

  // Storage bucket name
  static const String storageBucket = 'design-pdfs';

  // File size limits
  static const int maxFileSize = 1024 * 1024 * 1024; // 1GB

  // Revision numbers
  static const List<String> revisionNumbers = [
    '01', '02', '03', '04', '05', '06', '07', '08',
    '09', '10', '11', '12', '13', '14', '15',
  ];
}
