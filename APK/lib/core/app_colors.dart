import 'package:flutter/material.dart';

/// Central color tokens — mirrors the website's CSS variables
/// (purple/dark theme). Single source of truth for the whole app.
class AppColors {
  AppColors._();

  // ── Brand / accent ──
  static const accent = Color(0xFF7C3AED); // --accent
  static const accent2 = Color(0xFFA855F7); // --accent2
  static const accentBright = Color(0xFFA78BFA); // --accent-bright
  static const accentCyan = Color(0xFF0891B2);

  // ── Backgrounds (dark) ──
  static const bg = Color(0xFF0A0A14); // --bg
  static const surface = Color(0xFF15131F); // dropdown/surface
  static const card = Color(0xFF13111F); // --card
  static const cardElevated = Color(0xFF1E1E2E);

  // ── Text ──
  static const text = Color(0xFFE2D9F3); // --text
  static const textBright = Color(0xFFF0E6FF);
  static const textSecondary = Color(0xFF94A3B8); // --text-secondary
  static const muted = Color(0xFF64748B); // --muted

  // ── Status ──
  static const green = Color(0xFF10B981);
  static const red = Color(0xFFF43F5E);
  static const amber = Color(0xFFFBBF24);

  // ── Borders ──
  static const border = Color(0x1AFFFFFF); // rgba(255,255,255,.10)
  static const borderAccent = Color(0x337C3AED); // rgba(124,58,237,.2)

  // ── Gradients ──
  static const accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accent, accent2],
  );

  static const loginPanelGradient = LinearGradient(
    begin: Alignment(-0.6, -1),
    end: Alignment(0.6, 1),
    colors: [Color(0xFF5B21B6), accent, accentCyan],
    stops: [0.0, 0.4, 1.0],
  );

  /// Deterministic avatar gradient from a name (mirrors analytics.js `_avatarGrad`).
  static const List<List<Color>> avatarGradients = [
    [Color(0xFF7C3AED), Color(0xFFA855F7)],
    [Color(0xFF2563EB), Color(0xFF38BDF8)],
    [Color(0xFF059669), Color(0xFF34D399)],
    [Color(0xFFDC2626), Color(0xFFF87171)],
    [Color(0xFFD97706), Color(0xFFFBBF24)],
    [Color(0xFFDB2777), Color(0xFFF472B6)],
    [Color(0xFF7C3AED), Color(0xFFEC4899)],
    [Color(0xFF0891B2), Color(0xFF22D3EE)],
  ];

  static LinearGradient avatarGradient(String name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) {
      h = (h * 31 + name.codeUnitAt(i)) & 0x7FFFFFFF;
    }
    final pair = avatarGradients[h % avatarGradients.length];
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: pair,
    );
  }
}
