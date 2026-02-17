import 'dart:io';
import 'package:flutter/material.dart';
import '../models/folder.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class FolderProvider extends ChangeNotifier {
  final ApiService _api = ApiService();

  List<Folder> _rootFolders = [];
  Folder? _currentFolder;
  List<BreadcrumbItem> _breadcrumbs = [];
  List<SearchResult> _searchResults = [];
  List<UserInfo> _allUsers = [];
  bool _isLoading = false;
  bool _isSearching = false;
  bool _isUploading = false;
  String? _error;
  String? _searchQuery;

  List<Folder> get rootFolders => _rootFolders;
  Folder? get currentFolder => _currentFolder;
  List<BreadcrumbItem> get breadcrumbs => _breadcrumbs;
  List<SearchResult> get searchResults => _searchResults;
  List<UserInfo> get allUsers => _allUsers;
  bool get isLoading => _isLoading;
  bool get isSearching => _isSearching;
  bool get isUploading => _isUploading;
  String? get error => _error;
  String? get searchQuery => _searchQuery;

  Future<void> loadRootFolders() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _rootFolders = await _api.getRootFolders();
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> openFolder(String folderId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _api.getFolder(folderId),
        _api.getBreadcrumbs(folderId),
      ]);
      _currentFolder = results[0] as Folder;
      _breadcrumbs = results[1] as List<BreadcrumbItem>;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }

    _isLoading = false;
    notifyListeners();
  }

  void goToRoot() {
    _currentFolder = null;
    _breadcrumbs = [];
    _searchResults = [];
    _searchQuery = null;
    notifyListeners();
    loadRootFolders();
  }

  Future<bool> createFolder(String name, {String? parentFolderId}) async {
    try {
      await _api.createFolder(name, parentFolderId: parentFolderId);
      if (parentFolderId != null) {
        await openFolder(parentFolderId);
      } else {
        await loadRootFolders();
      }
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<bool> renameFolder(String folderId, String newName) async {
    try {
      await _api.renameFolder(folderId, newName);
      if (_currentFolder != null) {
        await openFolder(_currentFolder!.id);
      } else {
        await loadRootFolders();
      }
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteFolder(String folderId) async {
    try {
      await _api.deleteFolder(folderId);
      if (_currentFolder != null &&
          _currentFolder!.id != folderId) {
        await openFolder(_currentFolder!.id);
      } else {
        _currentFolder = null;
        _breadcrumbs = [];
        await loadRootFolders();
      }
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<bool> uploadDocument({
    required String folderId,
    required String revisionNumber,
    String? description,
    File? essDesignFile,
    File? thirdPartyFile,
    List<String>? recipientIds,
  }) async {
    _isUploading = true;
    _error = null;
    notifyListeners();

    try {
      await _api.uploadDocument(
        folderId: folderId,
        revisionNumber: revisionNumber,
        description: description,
        essDesignFile: essDesignFile,
        thirdPartyFile: thirdPartyFile,
        recipientIds: recipientIds,
      );
      _isUploading = false;
      notifyListeners();

      // Refresh current folder
      await openFolder(folderId);
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isUploading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteDocument(String documentId) async {
    try {
      await _api.deleteDocument(documentId);
      if (_currentFolder != null) {
        await openFolder(_currentFolder!.id);
      }
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateDocumentRevision(String documentId, String newRevisionNumber) async {
    try {
      await _api.updateDocumentRevision(documentId, newRevisionNumber);
      if (_currentFolder != null) {
        await openFolder(_currentFolder!.id);
      }
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<Map<String, dynamic>> getDownloadUrl(String documentId, String type) async {
    return await _api.getDownloadUrl(documentId, type);
  }

  Future<void> search(String query) async {
    if (query.length < 2) {
      _searchResults = [];
      _searchQuery = null;
      notifyListeners();
      return;
    }

    _isSearching = true;
    _searchQuery = query;
    notifyListeners();

    try {
      _searchResults = await _api.search(query);
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }

    _isSearching = false;
    notifyListeners();
  }

  void clearSearch() {
    _searchResults = [];
    _searchQuery = null;
    notifyListeners();
  }

  Future<void> loadAllUsers() async {
    try {
      _allUsers = await _api.getAllUsers();
      notifyListeners();
    } catch (e) {
      // Silently fail, users list is non-critical
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
