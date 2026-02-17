import 'package:flutter/material.dart';
import '../models/folder.dart';

class BreadcrumbBar extends StatelessWidget {
  final List<BreadcrumbItem> breadcrumbs;
  final Function(String?) onBreadcrumbTap;

  const BreadcrumbBar({
    super.key,
    required this.breadcrumbs,
    required this.onBreadcrumbTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.3),
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).dividerColor.withOpacity(0.2),
          ),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            InkWell(
              onTap: () => onBreadcrumbTap(null),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.home,
                    size: 16,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Root',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.primary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            ...breadcrumbs.asMap().entries.map((entry) {
              final index = entry.key;
              final item = entry.value;
              final isLast = index == breadcrumbs.length - 1;

              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Icon(
                      Icons.chevron_right,
                      size: 16,
                      color: Colors.grey[500],
                    ),
                  ),
                  InkWell(
                    onTap: isLast ? null : () => onBreadcrumbTap(item.id),
                    child: Text(
                      item.name,
                      style: TextStyle(
                        color: isLast
                            ? Theme.of(context).colorScheme.onSurface
                            : Theme.of(context).colorScheme.primary,
                        fontWeight: isLast ? FontWeight.bold : FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              );
            }),
          ],
        ),
      ),
    );
  }
}
