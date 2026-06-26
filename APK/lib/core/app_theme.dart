import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// The app's Material 3 theme, built from [AppColors] so the whole app
/// matches the website's purple/dark look. Fonts: Space Grotesk (display)
/// + Inter (body), via google_fonts.
class AppTheme {
  AppTheme._();

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);
    final textTheme = _textTheme(base.textTheme);

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bg,
      canvasColor: AppColors.bg,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.accent,
        secondary: AppColors.accent2,
        surface: AppColors.card,
        error: AppColors.red,
        onPrimary: Colors.white,
        onSurface: AppColors.text,
      ),
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.bg,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: AppColors.text),
        titleTextStyle: GoogleFonts.spaceGrotesk(
          color: AppColors.textBright,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0x0DFFFFFF),
        hintStyle: const TextStyle(color: AppColors.muted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: _inputBorder(AppColors.border),
        enabledBorder: _inputBorder(AppColors.border),
        focusedBorder: _inputBorder(AppColors.accent),
        errorBorder: _inputBorder(AppColors.red),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
          textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      dividerColor: AppColors.border,
      splashColor: AppColors.accent.withValues(alpha: 0.12),
      highlightColor: Colors.transparent,
    );
  }

  static OutlineInputBorder _inputBorder(Color c) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(11),
        borderSide: BorderSide(color: c),
      );

  static TextTheme _textTheme(TextTheme base) {
    final inter = GoogleFonts.interTextTheme(base);
    return inter.copyWith(
      displayLarge: GoogleFonts.spaceGrotesk(textStyle: base.displayLarge, color: AppColors.textBright, fontWeight: FontWeight.w700),
      displayMedium: GoogleFonts.spaceGrotesk(textStyle: base.displayMedium, color: AppColors.textBright, fontWeight: FontWeight.w700),
      headlineMedium: GoogleFonts.spaceGrotesk(textStyle: base.headlineMedium, color: AppColors.textBright, fontWeight: FontWeight.w700),
      headlineSmall: GoogleFonts.spaceGrotesk(textStyle: base.headlineSmall, color: AppColors.textBright, fontWeight: FontWeight.w700),
      titleLarge: GoogleFonts.spaceGrotesk(textStyle: base.titleLarge, color: AppColors.text, fontWeight: FontWeight.w700),
      titleMedium: GoogleFonts.spaceGrotesk(textStyle: base.titleMedium, color: AppColors.text, fontWeight: FontWeight.w600),
    ).apply(bodyColor: AppColors.text, displayColor: AppColors.textBright);
  }
}
