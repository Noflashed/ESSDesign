class Folder {
  final String id;
  final String name;
  final String? parentFolderId;
  final String? userId;
  final String? ownerName;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int? fileSize;
  final List<Folder> subFolders;
  final List<DesignDocument> documents;

  Folder({
    required this.id,
    required this.name,
    this.parentFolderId,
    this.userId,
    this.ownerName,
    required this.createdAt,
    required this.updatedAt,
    this.fileSize,
    this.subFolders = const [],
    this.documents = const [],
  });

  factory Folder.fromJson(Map<String, dynamic> json) {
    return Folder(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      parentFolderId: json['parentFolderId'],
      userId: json['userId'],
      ownerName: json['ownerName'],
      createdAt: DateTime.parse(json['createdAt'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updatedAt'] ?? DateTime.now().toIso8601String()),
      fileSize: json['fileSize'],
      subFolders: (json['subFolders'] as List<dynamic>?)
              ?.map((e) => Folder.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      documents: (json['documents'] as List<dynamic>?)
              ?.map((e) => DesignDocument.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'parentFolderId': parentFolderId,
      'userId': userId,
      'ownerName': ownerName,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'fileSize': fileSize,
    };
  }
}

class DesignDocument {
  final String id;
  final String folderId;
  final String revisionNumber;
  final String? description;
  final String? essDesignIssuePath;
  final String? essDesignIssueName;
  final String? thirdPartyDesignPath;
  final String? thirdPartyDesignName;
  final int? essDesignFileSize;
  final int? thirdPartyDesignFileSize;
  final int? totalFileSize;
  final String? userId;
  final String? ownerName;
  final DateTime createdAt;
  final DateTime updatedAt;

  DesignDocument({
    required this.id,
    required this.folderId,
    required this.revisionNumber,
    this.description,
    this.essDesignIssuePath,
    this.essDesignIssueName,
    this.thirdPartyDesignPath,
    this.thirdPartyDesignName,
    this.essDesignFileSize,
    this.thirdPartyDesignFileSize,
    this.totalFileSize,
    this.userId,
    this.ownerName,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DesignDocument.fromJson(Map<String, dynamic> json) {
    return DesignDocument(
      id: json['id'] ?? '',
      folderId: json['folderId'] ?? '',
      revisionNumber: json['revisionNumber'] ?? '',
      description: json['description'],
      essDesignIssuePath: json['essDesignIssuePath'],
      essDesignIssueName: json['essDesignIssueName'],
      thirdPartyDesignPath: json['thirdPartyDesignPath'],
      thirdPartyDesignName: json['thirdPartyDesignName'],
      essDesignFileSize: json['essDesignFileSize'],
      thirdPartyDesignFileSize: json['thirdPartyDesignFileSize'],
      totalFileSize: json['totalFileSize'],
      userId: json['userId'],
      ownerName: json['ownerName'],
      createdAt: DateTime.parse(json['createdAt'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updatedAt'] ?? DateTime.now().toIso8601String()),
    );
  }
}

class BreadcrumbItem {
  final String id;
  final String name;

  BreadcrumbItem({required this.id, required this.name});

  factory BreadcrumbItem.fromJson(Map<String, dynamic> json) {
    return BreadcrumbItem(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
    );
  }
}

class SearchResult {
  final String id;
  final String name;
  final String type;
  final String? parentFolderId;
  final String path;
  final List<Folder> subFolders;
  final List<DesignDocument> documents;

  SearchResult({
    required this.id,
    required this.name,
    required this.type,
    this.parentFolderId,
    required this.path,
    this.subFolders = const [],
    this.documents = const [],
  });

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    return SearchResult(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      type: json['type'] ?? '',
      parentFolderId: json['parentFolderId'],
      path: json['path'] ?? '',
      subFolders: (json['subFolders'] as List<dynamic>?)
              ?.map((e) => Folder.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      documents: (json['documents'] as List<dynamic>?)
              ?.map((e) => DesignDocument.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
