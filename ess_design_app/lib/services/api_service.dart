import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mime/mime.dart';

import '../models/folder.dart';
import '../models/user.dart';
import '../utils/constants.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String? _accessToken;
  String? _refreshToken;
  UserInfo? _currentUser;

  String get baseUrl => AppConstants.apiBaseUrl;

  Future<Map<String, String>> get _headers async {
    if (_accessToken == null) {
      await _loadTokens();
    }
    return {
      'Content-Type': 'application/json',
      if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
    };
  }

  Future<void> _loadTokens() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString('access_token');
    _refreshToken = prefs.getString('refresh_token');
    final userStr = prefs.getString('user');
    if (userStr != null) {
      _currentUser = UserInfo.fromJson(jsonDecode(userStr));
    }
  }

  Future<void> _saveTokens(String accessToken, String refreshToken, UserInfo user) async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    _currentUser = user;
    await prefs.setString('access_token', accessToken);
    await prefs.setString('refresh_token', refreshToken);
    await prefs.setString('user', jsonEncode(user.toJson()));
  }

  Future<void> clearTokens() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = null;
    _refreshToken = null;
    _currentUser = null;
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
    await prefs.remove('user');
  }

  UserInfo? get currentUser => _currentUser;

  bool get isAuthenticated => _accessToken != null;

  Future<void> checkAuth() async {
    await _loadTokens();
  }

  // ==================== AUTH ====================

  Future<UserInfo> signUp(String email, String password, String fullName) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/signup'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'fullName': fullName,
      }),
    );

    if (response.statusCode != 200) {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Sign up failed');
    }

    final data = jsonDecode(response.body);
    final user = UserInfo.fromJson(data['user']);
    await _saveTokens(data['accessToken'], data['refreshToken'], user);
    return user;
  }

  Future<UserInfo> signIn(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/signin'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    if (response.statusCode != 200) {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Sign in failed');
    }

    final data = jsonDecode(response.body);
    final user = UserInfo.fromJson(data['user']);
    await _saveTokens(data['accessToken'], data['refreshToken'], user);
    return user;
  }

  Future<void> signOut() async {
    try {
      final headers = await _headers;
      await http.post(
        Uri.parse('$baseUrl/auth/signout'),
        headers: headers,
      );
    } catch (_) {
      // Sign out locally even if API call fails
    }
    await clearTokens();
  }

  // ==================== FOLDERS ====================

  Future<List<Folder>> getRootFolders() async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/folders'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load folders');
    }

    final List<dynamic> data = jsonDecode(response.body);
    return data.map((e) => Folder.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Folder> getFolder(String folderId) async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/folders/$folderId'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load folder');
    }

    return Folder.fromJson(jsonDecode(response.body));
  }

  Future<List<BreadcrumbItem>> getBreadcrumbs(String folderId) async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/folders/$folderId/breadcrumbs'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load breadcrumbs');
    }

    final List<dynamic> data = jsonDecode(response.body);
    return data.map((e) => BreadcrumbItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Folder> createFolder(String name, {String? parentFolderId}) async {
    final headers = await _headers;
    final response = await http.post(
      Uri.parse('$baseUrl/folders'),
      headers: headers,
      body: jsonEncode({
        'name': name,
        'parentFolderId': parentFolderId,
        'userId': _currentUser?.id,
      }),
    );

    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Failed to create folder');
    }

    return Folder.fromJson(jsonDecode(response.body));
  }

  Future<void> renameFolder(String folderId, String newName) async {
    final headers = await _headers;
    final response = await http.put(
      Uri.parse('$baseUrl/folders/$folderId/rename'),
      headers: headers,
      body: jsonEncode({'newName': newName}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to rename folder');
    }
  }

  Future<void> deleteFolder(String folderId) async {
    final headers = await _headers;
    final response = await http.delete(
      Uri.parse('$baseUrl/folders/$folderId'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to delete folder');
    }
  }

  // ==================== DOCUMENTS ====================

  Future<Map<String, dynamic>> uploadDocument({
    required String folderId,
    required String revisionNumber,
    String? description,
    File? essDesignFile,
    File? thirdPartyFile,
    List<String>? recipientIds,
  }) async {
    final uri = Uri.parse('$baseUrl/folders/documents');
    final request = http.MultipartRequest('POST', uri);

    if (_accessToken != null) {
      request.headers['Authorization'] = 'Bearer $_accessToken';
    }

    request.fields['FolderId'] = folderId;
    request.fields['RevisionNumber'] = revisionNumber;
    if (_currentUser?.id != null) {
      request.fields['UserId'] = _currentUser!.id;
    }
    if (description != null && description.isNotEmpty) {
      request.fields['Description'] = description;
    }

    if (essDesignFile != null) {
      final mimeType = lookupMimeType(essDesignFile.path) ?? 'application/pdf';
      final parts = mimeType.split('/');
      request.files.add(await http.MultipartFile.fromPath(
        'EssDesignIssue',
        essDesignFile.path,
        contentType: MediaType(parts[0], parts[1]),
      ));
    }

    if (thirdPartyFile != null) {
      final mimeType = lookupMimeType(thirdPartyFile.path) ?? 'application/pdf';
      final parts = mimeType.split('/');
      request.files.add(await http.MultipartFile.fromPath(
        'ThirdPartyDesign',
        thirdPartyFile.path,
        contentType: MediaType(parts[0], parts[1]),
      ));
    }

    if (recipientIds != null) {
      for (final id in recipientIds) {
        request.fields['RecipientIds'] = id;
      }
    }

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode != 200 && response.statusCode != 201) {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Upload failed');
    }

    return jsonDecode(response.body);
  }

  Future<void> deleteDocument(String documentId) async {
    final headers = await _headers;
    final response = await http.delete(
      Uri.parse('$baseUrl/folders/documents/$documentId'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to delete document');
    }
  }

  Future<void> updateDocumentRevision(String documentId, String newRevisionNumber) async {
    final headers = await _headers;
    final response = await http.put(
      Uri.parse('$baseUrl/folders/documents/$documentId/revision'),
      headers: headers,
      body: jsonEncode({'newRevisionNumber': newRevisionNumber}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to update revision');
    }
  }

  Future<Map<String, dynamic>> getDownloadUrl(String documentId, String type) async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/folders/documents/$documentId/download/$type'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get download URL');
    }

    return jsonDecode(response.body);
  }

  // ==================== SEARCH ====================

  Future<List<SearchResult>> search(String query) async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/folders/search?q=${Uri.encodeComponent(query)}'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Search failed');
    }

    final List<dynamic> data = jsonDecode(response.body);
    return data.map((e) => SearchResult.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ==================== USER PREFERENCES ====================

  Future<UserPreferences> getPreferences() async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/userpreferences'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load preferences');
    }

    return UserPreferences.fromJson(jsonDecode(response.body));
  }

  Future<void> updatePreferences({
    String? selectedFolderId,
    String? theme,
    String? viewMode,
    int? sidebarWidth,
  }) async {
    final headers = await _headers;
    final body = <String, dynamic>{};
    if (selectedFolderId != null) body['selectedFolderId'] = selectedFolderId;
    if (theme != null) body['theme'] = theme;
    if (viewMode != null) body['viewMode'] = viewMode;
    if (sidebarWidth != null) body['sidebarWidth'] = sidebarWidth;

    final response = await http.put(
      Uri.parse('$baseUrl/userpreferences'),
      headers: headers,
      body: jsonEncode(body),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to update preferences');
    }
  }

  // ==================== USERS ====================

  Future<List<UserInfo>> getAllUsers() async {
    final headers = await _headers;
    final response = await http.get(
      Uri.parse('$baseUrl/users'),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load users');
    }

    final List<dynamic> data = jsonDecode(response.body);
    return data.map((e) => UserInfo.fromJson(e as Map<String, dynamic>)).toList();
  }
}
