import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class PreferencesProvider extends ChangeNotifier {
  final ApiService _api = ApiService();

  ThemeMode _themeMode = ThemeMode.light;
  String _viewMode = 'grid';
  String? _selectedFolderId;

  ThemeMode get themeMode => _themeMode;
  String get viewMode => _viewMode;
  String? get selectedFolderId => _selectedFolderId;
  bool get isGridView => _viewMode == 'grid';

  Future<void> loadPreferences() async {
    try {
      final prefs = await _api.getPreferences();
      _themeMode = prefs.theme == 'dark' ? ThemeMode.dark : ThemeMode.light;
      _viewMode = prefs.viewMode;
      _selectedFolderId = prefs.selectedFolderId;
      notifyListeners();
    } catch (e) {
      // Use defaults if loading fails
    }
  }

  Future<void> toggleTheme() async {
    _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();

    try {
      await _api.updatePreferences(
        theme: _themeMode == ThemeMode.dark ? 'dark' : 'light',
      );
    } catch (e) {
      // Revert on failure
      _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
      notifyListeners();
    }
  }

  Future<void> setViewMode(String mode) async {
    final oldMode = _viewMode;
    _viewMode = mode;
    notifyListeners();

    try {
      await _api.updatePreferences(viewMode: mode);
    } catch (e) {
      _viewMode = oldMode;
      notifyListeners();
    }
  }

  Future<void> setSelectedFolder(String? folderId) async {
    _selectedFolderId = folderId;
    notifyListeners();

    try {
      await _api.updatePreferences(selectedFolderId: folderId);
    } catch (e) {
      // Non-critical, don't revert
    }
  }
}
