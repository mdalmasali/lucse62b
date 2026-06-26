import 'package:flutter/material.dart';
import '../core/app_colors.dart';

/// Gradient initial-avatar — mirrors the web's deterministic avatar
/// (analytics.js `_avatarGrad`). Same name → same gradient everywhere.
class AvatarBadge extends StatelessWidget {
  final String name;
  final double size;
  final double radius;
  final double? fontSize;

  const AvatarBadge({
    super.key,
    required this.name,
    this.size = 40,
    this.radius = 12,
    this.fontSize,
  });

  String get _initial =>
      name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: AppColors.avatarGradient(name),
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: AppColors.avatarGradient(name).colors.first.withValues(alpha: 0.35),
            blurRadius: 10,
            spreadRadius: -2,
          ),
        ],
      ),
      child: Text(
        _initial,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: fontSize ?? size * 0.42,
        ),
      ),
    );
  }
}
