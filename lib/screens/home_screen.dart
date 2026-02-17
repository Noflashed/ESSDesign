import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/folder_provider.dart';
import '../providers/preferences_provider.dart';
import '../models/folder.dart';
import '../widgets/folder_card.dart';
import '../widgets/document_card.dart';
import '../widgets/breadcrumb_bar.dart';
import '../widgets/search_bar_widget.dart';
import 'upload_document_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<FolderProvider>().loadRootFolders();
      context.read<PreferencesProvider>().loadPreferences();
      context.read<FolderProvider>().loadAllUsers();
    });
  }

  void _showCreateFolderDialog() {
    final controller = TextEditingController();
    final folderProvider = context.read<FolderProvider>();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create Folder'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Folder Name',
            hintText: 'Enter folder name',
          ),
          onSubmitted: (_) async {
            if (controller.text.trim().isNotEmpty) {
              Navigator.of(ctx).pop();
              await folderProvider.createFolder(
                controller.text.trim(),
                parentFolderId: folderProvider.currentFolder?.id,
              );
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (controller.text.trim().isNotEmpty) {
                Navigator.of(ctx).pop();
                await folderProvider.createFolder(
                  controller.text.trim(),
                  parentFolderId: folderProvider.currentFolder?.id,
                );
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _navigateToUpload() {
    final folderProvider = context.read<FolderProvider>();
    if (folderProvider.currentFolder == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please open a folder first to upload documents'),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UploadDocumentScreen(
          folderId: folderProvider.currentFolder!.id,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final folders = context.watch<FolderProvider>();
    final prefs = context.watch<PreferencesProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('ESS Design'),
        leading: folders.currentFolder != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  if (folders.breadcrumbs.length > 1) {
                    folders.openFolder(
                      folders.breadcrumbs[folders.breadcrumbs.length - 2].id,
                    );
                  } else {
                    folders.goToRoot();
                  }
                },
              )
            : null,
        actions: [
          IconButton(
            icon: Icon(prefs.isGridView ? Icons.list : Icons.grid_view),
            onPressed: () {
              prefs.setViewMode(prefs.isGridView ? 'list' : 'grid');
            },
            tooltip: prefs.isGridView ? 'List view' : 'Grid view',
          ),
          IconButton(
            icon: Icon(
              prefs.themeMode == ThemeMode.dark
                  ? Icons.light_mode
                  : Icons.dark_mode,
            ),
            onPressed: () => prefs.toggleTheme(),
            tooltip: 'Toggle theme',
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'signout') {
                auth.signOut();
              }
            },
            itemBuilder: (ctx) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      auth.user?.fullName ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      auth.user?.email ?? '',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'signout',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 20),
                    SizedBox(width: 8),
                    Text('Sign Out'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          const SearchBarWidget(),
          if (folders.currentFolder != null && folders.searchQuery == null)
            BreadcrumbBar(
              breadcrumbs: folders.breadcrumbs,
              onBreadcrumbTap: (id) {
                if (id == null) {
                  folders.goToRoot();
                } else {
                  folders.openFolder(id);
                }
              },
            ),
          Expanded(
            child: _buildContent(folders, prefs),
          ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (folders.currentFolder != null && folders.searchQuery == null)
            FloatingActionButton.small(
              heroTag: 'upload',
              onPressed: _navigateToUpload,
              child: const Icon(Icons.upload_file),
            ),
          if (folders.currentFolder != null && folders.searchQuery == null)
            const SizedBox(height: 8),
          if (folders.searchQuery == null)
            FloatingActionButton(
              heroTag: 'create',
              onPressed: _showCreateFolderDialog,
              child: const Icon(Icons.create_new_folder),
            ),
        ],
      ),
    );
  }

  Widget _buildContent(FolderProvider folders, PreferencesProvider prefs) {
    if (folders.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (folders.error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red[300]),
            const SizedBox(height: 16),
            Text(folders.error!),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                folders.clearError();
                if (folders.currentFolder != null) {
                  folders.openFolder(folders.currentFolder!.id);
                } else {
                  folders.loadRootFolders();
                }
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    // Search results
    if (folders.searchQuery != null) {
      return _buildSearchResults(folders);
    }

    // Current folder contents
    if (folders.currentFolder != null) {
      return _buildFolderContents(folders, prefs);
    }

    // Root folders
    return _buildRootFolders(folders, prefs);
  }

  Widget _buildSearchResults(FolderProvider folders) {
    if (folders.isSearching) {
      return const Center(child: CircularProgressIndicator());
    }

    if (folders.searchResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 48, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'No results found for "${folders.searchQuery}"',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: folders.searchResults.length,
      itemBuilder: (context, index) {
        final result = folders.searchResults[index];
        return Card(
          child: ListTile(
            leading: Icon(
              result.type == 'folder' ? Icons.folder : Icons.description,
              color: result.type == 'folder' ? Colors.amber : Colors.blue,
            ),
            title: Text(result.name),
            subtitle: Text(
              result.path,
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
            onTap: () {
              folders.clearSearch();
              folders.openFolder(result.id);
            },
          ),
        );
      },
    );
  }

  Widget _buildRootFolders(FolderProvider folders, PreferencesProvider prefs) {
    if (folders.rootFolders.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_open, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'No folders yet',
              style: TextStyle(fontSize: 18, color: Colors.grey[600]),
            ),
            const SizedBox(height: 8),
            Text(
              'Tap the + button to create one',
              style: TextStyle(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return _buildFolderList(folders.rootFolders, [], prefs, folders);
  }

  Widget _buildFolderContents(FolderProvider folders, PreferencesProvider prefs) {
    final folder = folders.currentFolder!;
    final hasContent = folder.subFolders.isNotEmpty || folder.documents.isNotEmpty;

    if (!hasContent) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_open, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'This folder is empty',
              style: TextStyle(fontSize: 18, color: Colors.grey[600]),
            ),
            const SizedBox(height: 8),
            Text(
              'Add subfolders or upload documents',
              style: TextStyle(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return _buildFolderList(
      folder.subFolders,
      folder.documents,
      prefs,
      folders,
    );
  }

  Widget _buildFolderList(
    List<Folder> subFolders,
    List<DesignDocument> documents,
    PreferencesProvider prefs,
    FolderProvider folderProvider,
  ) {
    if (prefs.isGridView) {
      return GridView.builder(
        padding: const EdgeInsets.all(8),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 1.2,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        itemCount: subFolders.length + documents.length,
        itemBuilder: (context, index) {
          if (index < subFolders.length) {
            return FolderCard(
              folder: subFolders[index],
              isGrid: true,
              onTap: () => folderProvider.openFolder(subFolders[index].id),
              onRename: (newName) => folderProvider.renameFolder(
                subFolders[index].id,
                newName,
              ),
              onDelete: () => folderProvider.deleteFolder(subFolders[index].id),
            );
          }
          final docIndex = index - subFolders.length;
          return DocumentCard(
            document: documents[docIndex],
            isGrid: true,
          );
        },
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: subFolders.length + documents.length,
      itemBuilder: (context, index) {
        if (index < subFolders.length) {
          return FolderCard(
            folder: subFolders[index],
            isGrid: false,
            onTap: () => folderProvider.openFolder(subFolders[index].id),
            onRename: (newName) => folderProvider.renameFolder(
              subFolders[index].id,
              newName,
            ),
            onDelete: () => folderProvider.deleteFolder(subFolders[index].id),
          );
        }
        final docIndex = index - subFolders.length;
        return DocumentCard(
          document: documents[docIndex],
          isGrid: false,
        );
      },
    );
  }
}
