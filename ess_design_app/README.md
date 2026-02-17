# ESS Design - Flutter iOS App

A Flutter iOS app for the ESS Design Document Management System. This app connects to the same backend API and Supabase database as the web application.

## Features

- **Authentication**: Sign up, sign in, sign out via Supabase Auth
- **Folder Management**: Create, rename, delete folders with hierarchical navigation
- **Document Management**: Upload PDFs (ESS Design + Third Party), download, view, delete
- **Revision Control**: Revision numbers (01-15) for design documents
- **PDF Viewer**: In-app PDF viewing
- **Search**: Full-text search across folders
- **Email Notifications**: Notify recipients when documents are uploaded
- **Dark/Light Theme**: Persistent theme preference
- **Grid/List View**: Switchable view modes

## Architecture

The app communicates with the existing .NET backend API (same as the web app), ensuring:
- Same Supabase PostgreSQL database
- Same Supabase Storage for files
- Same business logic and validation
- Same email notification system

```
Flutter App  -->  .NET Backend API  -->  Supabase (PostgreSQL + Storage)
                                    -->  Resend (Email notifications)
```

## Setup

### Prerequisites

- Flutter SDK >= 3.2.0
- Xcode (for iOS builds)
- CocoaPods

### Configuration

1. Update the API base URL in `lib/utils/constants.dart`:
   ```dart
   static const String apiBaseUrl = 'https://your-api-url.com/api';
   ```

2. The Supabase credentials are already configured to match the web app.

### Running

```bash
# Get dependencies
flutter pub get

# Run on iOS simulator
flutter run -d ios

# Build for release
flutter build ios
```

## Project Structure

```
lib/
  main.dart                    # App entry point
  models/
    folder.dart                # Folder, Document, Breadcrumb, SearchResult models
    user.dart                  # UserInfo, UserPreferences models
  services/
    api_service.dart           # HTTP client for .NET backend API
  providers/
    auth_provider.dart         # Authentication state management
    folder_provider.dart       # Folder/document state management
    preferences_provider.dart  # User preferences state management
  screens/
    login_screen.dart          # Sign in screen
    signup_screen.dart         # Registration screen
    home_screen.dart           # Main screen with folder browser
    upload_document_screen.dart # Document upload form
    pdf_viewer_screen.dart     # In-app PDF viewer
  widgets/
    folder_card.dart           # Folder display (grid/list)
    document_card.dart         # Document display (grid/list)
    breadcrumb_bar.dart        # Breadcrumb navigation
    search_bar_widget.dart     # Search input with debounce
  theme/
    app_theme.dart             # Light and dark theme definitions
  utils/
    constants.dart             # App-wide constants (URLs, keys)
    helpers.dart               # Date/file size formatting utilities
```
