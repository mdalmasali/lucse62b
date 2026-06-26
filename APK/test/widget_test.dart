// Basic smoke test for the CSE 62B app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lucse62b/core/app_theme.dart';

void main() {
  testWidgets('App theme builds and renders', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: Center(child: Text('CSE 62B'))),
      ),
    );
    expect(find.text('CSE 62B'), findsOneWidget);
  });
}
