import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_colors.dart';

/// Placeholder while the native Draw & Guess game is being built. This route
/// exists so the hub links somewhere clean (never a WebView). It will be
/// replaced by the full native canvas game.
class DrawScreen extends StatelessWidget {
  const DrawScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Draw & Guess'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/games'),
        ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(34),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🎨', style: TextStyle(fontSize: 56)),
              const SizedBox(height: 14),
              const Text('Native Draw & Guess is on the way',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textBright, fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text(
                'A real native drawing canvas with live strokes is being built — it lands in the next update. Imposter is ready to play now!',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13.5, height: 1.5),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: () => context.go('/games/imposter'),
                style: FilledButton.styleFrom(backgroundColor: AppColors.accent),
                icon: const Text('🕵️', style: TextStyle(fontSize: 16)),
                label: const Text('Play Imposter'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
