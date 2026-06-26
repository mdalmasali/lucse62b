import 'package:flutter/material.dart';
import '../../core/app_colors.dart';

/// The branded gradient header panel from the web login (AsmrProg style),
/// adapted to a top banner for mobile.
class LoginPanel extends StatelessWidget {
  const LoginPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
        decoration: const BoxDecoration(gradient: AppColors.loginPanelGradient),
        child: Stack(
          children: [
            Positioned(
              top: -40,
              right: -40,
              child: _circle(160, 0.07),
            ),
            Positioned(
              bottom: -50,
              left: -40,
              child: _circle(120, 0.06),
            ),
            Column(
              children: [
                Container(
                  width: 70,
                  height: 70,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white24, width: 3),
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                  child: const Icon(Icons.school_rounded,
                      color: Colors.white, size: 30),
                ),
                const SizedBox(height: 14),
                const Text('CSE 62B Portal',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text('Batch 62 · Section B\nLeading University, Sylhet',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: 12.5,
                        height: 1.5)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _circle(double size, double opacity) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: opacity),
        ),
      );
}
