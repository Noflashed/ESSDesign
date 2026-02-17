class UserInfo {
  final String id;
  final String email;
  final String fullName;

  UserInfo({
    required this.id,
    required this.email,
    required this.fullName,
  });

  factory UserInfo.fromJson(Map<String, dynamic> json) {
    return UserInfo(
      id: json['id'] ?? '',
      email: json['email'] ?? '',
      fullName: json['fullName'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'fullName': fullName,
    };
  }
}

class UserPreferences {
  final String userId;
  final String? selectedFolderId;
  final String theme;
  final String viewMode;
  final int sidebarWidth;
  final DateTime createdAt;
  final DateTime updatedAt;

  UserPreferences({
    required this.userId,
    this.selectedFolderId,
    this.theme = 'light',
    this.viewMode = 'grid',
    this.sidebarWidth = 280,
    required this.createdAt,
    required this.updatedAt,
  });

  factory UserPreferences.fromJson(Map<String, dynamic> json) {
    return UserPreferences(
      userId: json['userId'] ?? '',
      selectedFolderId: json['selectedFolderId'],
      theme: json['theme'] ?? 'light',
      viewMode: json['viewMode'] ?? 'grid',
      sidebarWidth: json['sidebarWidth'] ?? 280,
      createdAt: DateTime.parse(json['createdAt'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updatedAt'] ?? DateTime.now().toIso8601String()),
    );
  }
}
