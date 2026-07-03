#!/usr/bin/env python3
"""Scan text files for integrity issues (encoding, incomplete syntax)."""

import os
import sys
from pathlib import Path

def scan_directory(directory: str) -> bool:
    """Scan all text files in directory for integrity issues."""
    issues = []
    file_count = 0

    patterns = ('*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.css')

    for pattern in patterns:
        for filepath in Path(directory).rglob(pattern):
            if 'node_modules' in filepath.parts or 'dist' in filepath.parts:
                continue

            file_count += 1
            try:
                content = filepath.read_text(encoding='utf-8')

                # Check for incomplete syntax markers (skip for .ts/.tsx files with template literals/regex)
                ext = filepath.suffix.lower()
                if ext not in ['.ts', '.tsx']:
                    if content.count('{') != content.count('}'):
                        issues.append(f"{filepath}: Unbalanced braces")
                    if content.count('[') != content.count(']'):
                        issues.append(f"{filepath}: Unbalanced brackets")
                    if content.count('(') != content.count(')'):
                        issues.append(f"{filepath}: Unbalanced parentheses")

                # Check for truncation markers
                if content.endswith('...') or '...\n' in content[-100:]:
                    issues.append(f"{filepath}: Possible truncation marker")

            except UnicodeDecodeError as e:
                issues.append(f"{filepath}: Encoding error - {e}")
            except Exception as e:
                issues.append(f"{filepath}: Read error - {e}")

    print(f"Scanned {file_count} files in {directory}")

    if issues:
        print(f"\n[FAIL] Found {len(issues)} issues:")
        for issue in issues:
            print(f"  {issue}")
        return False
    else:
        print("[PASS] No integrity issues found")
        return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python scan_text_integrity.py <directory>")
        sys.exit(1)

    directory = sys.argv[1]
    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a directory")
        sys.exit(1)

    success = scan_directory(directory)
    sys.exit(0 if success else 1)
