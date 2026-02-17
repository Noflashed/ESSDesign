import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/folder.dart';
import '../providers/folder_provider.dart';
import '../screens/pdf_viewer_screen.dart';
import '../utils/constants.dart';

class DocumentCard extends StatelessWidget {
  final DesignDocument document;
  final bool isGrid;

  const DocumentCard({
    super.key,
    required this.document,
    required this.isGrid,
  });

  String _formatFileSize(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '${bytes}B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)}KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)}MB';
  }

  void _showOptionsMenu(BuildContext context) {
    final folderProvider = context.read<FolderProvider>();

    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (document.essDesignIssuePath != null)
              ListTile(
                leading: const Icon(Icons.visibility),
                title: const Text('View ESS Design'),
                onTap: () async {
                  Navigator.of(ctx).pop();
                  await _viewDocument(context, 'ess');
                },
              ),
            if (document.thirdPartyDesignPath != null)
              ListTile(
                leading: const Icon(Icons.visibility),
                title: const Text('View Third Party Design'),
                onTap: () async {
                  Navigator.of(ctx).pop();
                  await _viewDocument(context, 'thirdparty');
                },
              ),
            if (document.essDesignIssuePath != null)
              ListTile(
                leading: const Icon(Icons.download),
                title: const Text('Download ESS Design'),
                onTap: () async {
                  Navigator.of(ctx).pop();
                  await _downloadDocument(context, 'ess');
                },
              ),
            if (document.thirdPartyDesignPath != null)
              ListTile(
                leading: const Icon(Icons.download),
                title: const Text('Download Third Party Design'),
                onTap: () async {
                  Navigator.of(ctx).pop();
                  await _downloadDocument(context, 'thirdparty');
                },
              ),
            ListTile(
              leading: const Icon(Icons.edit),
              title: const Text('Change Revision'),
              onTap: () {
                Navigator.of(ctx).pop();
                _showRevisionDialog(context, folderProvider);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete, color: Colors.red),
              title: const Text('Delete', style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.of(ctx).pop();
                _showDeleteConfirmation(context, folderProvider);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _viewDocument(BuildContext context, String type) async {
    try {
      final folderProvider = context.read<FolderProvider>();
      final result = await folderProvider.getDownloadUrl(document.id, type);
      if (context.mounted) {
        final title = type == 'ess'
            ? (document.essDesignIssueName ?? 'ESS Design')
            : (document.thirdPartyDesignName ?? 'Third Party Design');
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PDFViewerScreen(
              url: result['url'],
              title: title,
            ),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load document: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _downloadDocument(BuildContext context, String type) async {
    try {
      final folderProvider = context.read<FolderProvider>();
      final result = await folderProvider.getDownloadUrl(document.id, type);
      final uri = Uri.parse(result['url']);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to download: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showRevisionDialog(BuildContext context, FolderProvider folderProvider) {
    String selected = document.revisionNumber;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Change Revision'),
          content: DropdownButtonFormField<String>(
            value: selected,
            items: AppConstants.revisionNumbers
                .map((r) => DropdownMenuItem(value: r, child: Text('Revision $r')))
                .toList(),
            onChanged: (value) {
              if (value != null) {
                setDialogState(() => selected = value);
              }
            },
            decoration: const InputDecoration(border: OutlineInputBorder()),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                folderProvider.updateDocumentRevision(document.id, selected);
              },
              child: const Text('Update'),
            ),
          ],
        ),
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context, FolderProvider folderProvider) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Document'),
        content: const Text(
          'Are you sure you want to delete this document? This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              Navigator.of(ctx).pop();
              folderProvider.deleteDocument(document.id);
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasEss = document.essDesignIssuePath != null;
    final hasThirdParty = document.thirdPartyDesignPath != null;

    if (isGrid) {
      return Card(
        child: InkWell(
          onTap: () => _showOptionsMenu(context),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.description,
                  size: 40,
                  color: Colors.blue,
                ),
                const SizedBox(height: 8),
                Text(
                  'Rev ${document.revisionNumber}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (hasEss)
                      Tooltip(
                        message: 'ESS Design',
                        child: Icon(Icons.picture_as_pdf,
                            size: 16, color: Colors.red[400]),
                      ),
                    if (hasEss && hasThirdParty) const SizedBox(width: 4),
                    if (hasThirdParty)
                      Tooltip(
                        message: 'Third Party',
                        child: Icon(Icons.picture_as_pdf,
                            size: 16, color: Colors.orange[400]),
                      ),
                  ],
                ),
                if (document.totalFileSize != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    _formatFileSize(document.totalFileSize),
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    return Card(
      child: ListTile(
        leading: const Icon(Icons.description, color: Colors.blue, size: 40),
        title: Text('Revision ${document.revisionNumber}'),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (document.description != null && document.description!.isNotEmpty)
              Text(
                document.description!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              ),
            Row(
              children: [
                if (hasEss)
                  Chip(
                    label: const Text('ESS', style: TextStyle(fontSize: 10)),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                    backgroundColor: Colors.red[50],
                  ),
                if (hasEss && hasThirdParty) const SizedBox(width: 4),
                if (hasThirdParty)
                  Chip(
                    label: const Text('3rd Party', style: TextStyle(fontSize: 10)),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                    backgroundColor: Colors.orange[50],
                  ),
                if (document.totalFileSize != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    _formatFileSize(document.totalFileSize),
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                ],
              ],
            ),
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.more_vert),
          onPressed: () => _showOptionsMenu(context),
        ),
        onTap: () => _showOptionsMenu(context),
      ),
    );
  }
}
