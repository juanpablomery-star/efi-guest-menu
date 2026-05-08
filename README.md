# EFI Guest Menu

Guest-facing QR menu for EFI Hotel. Allows guests to view products, add items to cart, and place orders from their room.

## Features

- **Login**: Room number + guest code validation
- **Menu**: Browse products by category (Bebida, Comida, Otro)
- **Cart**: Add/remove items, adjust quantities
- **Payment**: Choose between cash or card
- **Order Status**: Real-time order status tracking

## Setup

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to start. Guest enters room number and code received at check-in.

## Environment

Uses hardcoded Firebase config (efi-hotel project). No environment variables needed.

## Routes

- `/` - Login screen
- `/menu/[roomId]` - Product menu + cart
- `/menu/[roomId]/status?orderId=...` - Order status
