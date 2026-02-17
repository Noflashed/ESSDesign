import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api = ApiService();

  bool _isLoading = true;
  bool _isAuthenticating = false;
  String? _error;
  UserInfo? _user;

  bool get isLoading => _isLoading;
  bool get isAuthenticating => _isAuthenticating;
  bool get isAuthenticated => _user != null;
  String? get error => _error;
  UserInfo? get user => _user;

  AuthProvider() {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    _isLoading = true;
    notifyListeners();

    try {
      await _api.checkAuth();
      if (_api.isAuthenticated) {
        _user = _api.currentUser;
      }
    } catch (e) {
      _user = null;
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<bool> signUp(String email, String password, String fullName) async {
    _isAuthenticating = true;
    _error = null;
    notifyListeners();

    try {
      _user = await _api.signUp(email, password, fullName);
      _isAuthenticating = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isAuthenticating = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> signIn(String email, String password) async {
    _isAuthenticating = true;
    _error = null;
    notifyListeners();

    try {
      _user = await _api.signIn(email, password);
      _isAuthenticating = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isAuthenticating = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> signOut() async {
    await _api.signOut();
    _user = null;
    _error = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
