import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import '../providers/folder_provider.dart';
import '../models/user.dart';
import '../utils/constants.dart';

class UploadDocumentScreen extends StatefulWidget {
  final String folderId;

  const UploadDocumentScreen({super.key, required this.folderId});

  @override
  State<UploadDocumentScreen> createState() => _UploadDocumentScreenState();
}

class _UploadDocumentScreenState extends State<UploadDocumentScreen> {
  String _revisionNumber = '01';
  final _descriptionController = TextEditingController();
  File? _essDesignFile;
  File? _thirdPartyFile;
  String? _essDesignFileName;
  String? _thirdPartyFileName;
  final List<String> _selectedRecipientIds = [];

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickFile(bool isEssDesign) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
    );

    if (result != null && result.files.single.path != null) {
      setState(() {
        if (isEssDesign) {
          _essDesignFile = File(result.files.single.path!);
          _essDesignFileName = result.files.single.name;
        } else {
          _thirdPartyFile = File(result.files.single.path!);
          _thirdPartyFileName = result.files.single.name;
        }
      });
    }
  }

  Future<void> _handleUpload() async {
    if (_essDesignFile == null && _thirdPartyFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select at least one file to upload'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final folderProvider = context.read<FolderProvider>();
    final success = await folderProvider.uploadDocument(
      folderId: widget.folderId,
      revisionNumber: _revisionNumber,
      description: _descriptionController.text.trim(),
      essDesignFile: _essDesignFile,
      thirdPartyFile: _thirdPartyFile,
      recipientIds: _selectedRecipientIds.isNotEmpty ? _selectedRecipientIds : null,
    );

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Document uploaded successfully'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(folderProvider.error ?? 'Upload failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final folderProvider = context.watch<FolderProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Upload Document'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Revision Number
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Revision Number',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: _revisionNumber,
                      items: AppConstants.revisionNumbers
                          .map((r) => DropdownMenuItem(
                                value: r,
                                child: Text('Revision $r'),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _revisionNumber = value);
                        }
                      },
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Description
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Description / Change Notes',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _descriptionController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'Optional: describe what changed in this revision...',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ESS Design File
            _buildFilePickerCard(
              title: 'ESS Design Issue (PDF)',
              fileName: _essDesignFileName,
              onPick: () => _pickFile(true),
              onRemove: () {
                setState(() {
                  _essDesignFile = null;
                  _essDesignFileName = null;
                });
              },
            ),
            const SizedBox(height: 16),

            // Third Party Design File
            _buildFilePickerCard(
              title: 'Third Party Design (PDF)',
              fileName: _thirdPartyFileName,
              onPick: () => _pickFile(false),
              onRemove: () {
                setState(() {
                  _thirdPartyFile = null;
                  _thirdPartyFileName = null;
                });
              },
            ),
            const SizedBox(height: 16),

            // Email Recipients
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Notify Recipients (Optional)',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (folderProvider.allUsers.isEmpty)
                      const Text(
                        'No users available',
                        style: TextStyle(color: Colors.grey),
                      )
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: folderProvider.allUsers.map((user) {
                          final isSelected = _selectedRecipientIds.contains(user.id);
                          return FilterChip(
                            label: Text(user.fullName),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() {
                                if (selected) {
                                  _selectedRecipientIds.add(user.id);
                                } else {
                                  _selectedRecipientIds.remove(user.id);
                                }
                              });
                            },
                          );
                        }).toList(),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Upload Button
            SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: folderProvider.isUploading ? null : _handleUpload,
                icon: folderProvider.isUploading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_upload),
                label: Text(
                  folderProvider.isUploading ? 'Uploading...' : 'Upload Document',
                  style: const TextStyle(fontSize: 16),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildFilePickerCard({
    required String title,
    required String? fileName,
    required VoidCallback onPick,
    required VoidCallback onRemove,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (fileName != null)
              Row(
                children: [
                  const Icon(Icons.picture_as_pdf, color: Colors.red),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      fileName,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: onRemove,
                  ),
                ],
              )
            else
              OutlinedButton.icon(
                onPressed: onPick,
                icon: const Icon(Icons.attach_file),
                label: const Text('Select PDF File'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
