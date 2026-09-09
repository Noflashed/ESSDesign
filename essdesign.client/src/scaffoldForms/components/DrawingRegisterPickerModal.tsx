// Derived from ESSApp/src/components/DrawingRegisterPickerModal.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../browser/runtime';
import Feather from '../browser/Feather';

import {DesignDocument, Folder} from '../models/folder';
import api from '../services/apiService';
import {getSafetyBuilders} from '../services/supabaseSafetyProjects';
import {Colors, FontSize, Spacing} from '../theme/appTheme';

export type DrawingRegisterSelection = {
  drawingNumber: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
};

type Props = {
  visible: boolean;
  designFolderId?: string;
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  onSelect: (selection: DrawingRegisterSelection) => void;
  onClose: () => void;
};

type BrowserItem = {type: 'folder'; data: Folder} | {type: 'document'; data: DesignDocument};

function isRevisionsFolder(name: string): boolean {
  return /\brevisions?\b/i.test(name);
}

function documentName(document: DesignDocument): string {
  return document.essDesignIssueName
    || document.thirdPartyDesignName
    || document.description
    || `Revision ${document.revisionNumber}`;
}

function drawingNumberFromName(value: string): string {
  const match = value.match(/\bESD\s*[-_]*\s*(\d{3,6})\b/i);
  return match ? `ESD${match[1]}` : value.replace(/\.pdf$/i, '').trim();
}

function revisionValue(document: DesignDocument): number {
  const match = document.revisionNumber.match(/\d+/)
    || documentName(document).match(/\bREV(?:ISION)?\s*[-_]*\s*(\d+)\b/i);
  return match ? Number.parseInt(match[1] || match[0], 10) : -1;
}

function latestDocument(documents: DesignDocument[]): DesignDocument | null {
  const selectable = documents.filter(document => (
    document.essDesignIssuePath || document.thirdPartyDesignPath
  ));
  return [...selectable].sort((left, right) => {
    const revisionDifference = revisionValue(right) - revisionValue(left);
    return revisionDifference || (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
  })[0] ?? null;
}

function selectionFromDocument(document: DesignDocument): DrawingRegisterSelection | null {
  const drawingDocumentType = document.essDesignIssuePath
    ? 'ess'
    : document.thirdPartyDesignPath
      ? 'thirdparty'
      : '';
  if (!drawingDocumentType) {
    return null;
  }
  const drawingDocumentName = documentName(document);
  return {
    drawingNumber: drawingNumberFromName(drawingDocumentName),
    drawingDocumentId: document.id,
    drawingDocumentType,
    drawingDocumentName,
    drawingRevisionNumber: document.revisionNumber,
    drawingFolderId: document.folderId,
  };
}

export default function DrawingRegisterPickerModal({
  visible,
  designFolderId,
  builderId,
  builderName,
  projectId,
  projectName,
  onSelect,
  onClose,
}: Props) {
  const [rootFolder, setRootFolder] = React.useState<Folder | null>(null);
  const [currentFolder, setCurrentFolder] = React.useState<Folder | null>(null);
  const [breadcrumbs, setBreadcrumbs] = React.useState<Array<{id: string; name: string}>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const cacheRef = React.useRef(new Map<string, Folder>());

  const loadProjectRoot = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let folderId = designFolderId?.trim();
      if (designFolderId === undefined) {
        const builders = await getSafetyBuilders(true);
        const builder = builders.find(item => item.id === builderId)
          ?? builders.find(item => item.name.trim().toLowerCase() === builderName.trim().toLowerCase());
        const project = builder?.projects.find(item => item.id === projectId)
          ?? builder?.projects.find(item => item.name.trim().toLowerCase() === projectName.trim().toLowerCase());
        folderId = project?.designFolderId?.trim();
      }
      if (!folderId) {
        throw new Error('This project does not have a Design folder linked yet.');
      }
      const folder = cacheRef.current.get(folderId) ?? await api.getFolder(folderId);
      cacheRef.current.set(folderId, folder);
      setRootFolder(folder);
      setCurrentFolder(folder);
      setBreadcrumbs([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the Design Register.');
    } finally {
      setLoading(false);
    }
  }, [builderId, builderName, projectId, projectName, designFolderId]);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    loadProjectRoot().catch(() => {});
  }, [loadProjectRoot, visible]);

  const chooseDocument = React.useCallback((document: DesignDocument) => {
    const selection = selectionFromDocument(document);
    if (!selection) {
      setError('This record does not contain a downloadable PDF.');
      return;
    }
    onSelect(selection);
  }, [onSelect]);

  const openFolder = React.useCallback(async (folder: Folder) => {
    setLoading(true);
    setError('');
    try {
      const loaded = cacheRef.current.get(folder.id) ?? await api.getFolder(folder.id);
      cacheRef.current.set(folder.id, loaded);

      let latest = latestDocument(loaded.documents);
      const revisionsFolder = loaded.subFolders.find(item => isRevisionsFolder(item.name));
      if (!latest && revisionsFolder) {
        const revisions = cacheRef.current.get(revisionsFolder.id) ?? await api.getFolder(revisionsFolder.id);
        cacheRef.current.set(revisionsFolder.id, revisions);
        latest = latestDocument(revisions.documents);
      }
      if (latest) {
        chooseDocument(latest);
        return;
      }
      if (revisionsFolder) {
        setError('No revision PDFs were found for this scaffold.');
        return;
      }
      setCurrentFolder(loaded);
      setBreadcrumbs(previous => [...previous, {id: loaded.id, name: loaded.name}]);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open this folder.');
    } finally {
      setLoading(false);
    }
  }, [chooseDocument]);

  const openBreadcrumb = React.useCallback(async (index: number) => {
    const crumb = breadcrumbs[index];
    const folder = cacheRef.current.get(crumb.id);
    if (!folder) {
      return;
    }
    setCurrentFolder(folder);
    setBreadcrumbs(previous => previous.slice(0, index + 1));
  }, [breadcrumbs]);

  const items = React.useMemo<BrowserItem[]>(() => currentFolder ? [
    ...currentFolder.subFolders
      .filter(folder => !isRevisionsFolder(folder.name))
      .map(folder => ({type: 'folder' as const, data: folder})),
    ...currentFolder.documents
      .filter(document => document.essDesignIssuePath || document.thirdPartyDesignPath)
      .map(document => ({type: 'document' as const, data: document})),
  ] : [], [currentFolder]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={1}>{projectName} Designs</Text>
              <Text style={styles.subtitle}>Select a drawing to link to this scaffold</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Design Register" style={styles.closeButton} onPress={onClose}>
              <Feather name="x" size={19} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={styles.breadcrumbRow}>
            <TouchableOpacity
              style={styles.breadcrumbButton}
              disabled={!rootFolder || loading}
              onPress={() => {
                if (rootFolder) {
                  setCurrentFolder(rootFolder);
                  setBreadcrumbs([]);
                }
              }}>
              <Text style={styles.breadcrumbText}>Project</Text>
            </TouchableOpacity>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <Feather name="chevron-right" size={14} color="#94A3B8" />
                <TouchableOpacity style={styles.breadcrumbButton} onPress={() => openBreadcrumb(index)}>
                  <Text style={styles.breadcrumbText} numberOfLines={1}>{crumb.name}</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} /> : null}
          <FlatList
            data={items}
            keyExtractor={item => `${item.type}:${item.data.id}`}
            style={styles.list}
            contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
            ListEmptyComponent={loading ? null : (
              <Text style={styles.emptyText}>No folders or PDF drawings are available here.</Text>
            )}
            renderItem={({item}) => (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.item}
                onPress={() => item.type === 'folder'
                  ? openFolder(item.data).catch(() => {})
                  : chooseDocument(item.data)}>
                <View style={styles.itemIcon}>
                  <Feather name={item.type === 'folder' ? 'folder' : 'file-text'} size={18} color={item.type === 'folder' ? '#F47B20' : Colors.primary} />
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.type === 'folder' ? item.data.name : documentName(item.data)}
                  </Text>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>
                    {item.type === 'folder' ? 'Folder' : `PDF drawing • Revision ${item.data.revisionNumber}`}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(15,23,42,0.48)', alignItems: 'center', justifyContent: 'center', padding: Spacing.md},
  card: {width: '100%', maxWidth: 680, maxHeight: '82%', borderRadius: 16, backgroundColor: '#FFFFFF', padding: Spacing.md},
  header: {flexDirection: 'row', alignItems: 'center'},
  headerCopy: {flex: 1, minWidth: 0},
  title: {fontSize: FontSize.lg, lineHeight: 23, fontWeight: '700', color: '#111827'},
  subtitle: {fontSize: FontSize.sm, lineHeight: 17, color: '#64748B', marginTop: 2},
  closeButton: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9'},
  breadcrumbRow: {minHeight: 38, marginTop: 14, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5},
  breadcrumbButton: {maxWidth: 170, minHeight: 30, borderRadius: 7, borderWidth: 1, borderColor: '#DCE2E9', backgroundColor: '#F8FAFC', justifyContent: 'center', paddingHorizontal: 9},
  breadcrumbText: {fontSize: 11, fontWeight: '600', color: '#334155'},
  error: {fontSize: FontSize.sm, lineHeight: 18, color: '#B42318', marginTop: 8},
  loader: {marginVertical: 8},
  list: {marginTop: 8, maxHeight: 460},
  emptyList: {minHeight: 120, justifyContent: 'center'},
  emptyText: {fontSize: FontSize.sm, color: '#64748B', textAlign: 'center'},
  item: {minHeight: 62, marginBottom: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center'},
  itemIcon: {width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF'},
  itemCopy: {flex: 1, minWidth: 0, marginHorizontal: 10},
  itemTitle: {fontSize: FontSize.md, lineHeight: 19, fontWeight: '700', color: '#111827'},
  itemSubtitle: {fontSize: FontSize.sm, lineHeight: 16, color: '#64748B', marginTop: 2},
});
