#!/usr/bin/env python3
"""Apply private Wallet configuration to the existing Loyalty Docker environment."""
import sys
from wallet_local import main
if __name__ == '__main__':
    raise SystemExit(main(['start', *sys.argv[1:]]))
