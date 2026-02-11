# COMP3133 Lab Test 1 Chat Application

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start MongoDB locally or use MongoDB Atlas.

3. Run the server:

```bash
npm start
```

4. Open:

`http://localhost:3000/view/signup.html`  
`http://localhost:3000/view/login.html`

## Docker Setup

1. Start everything:

```bash
docker compose up --build
```

2. Open:

`http://localhost:3000/view/login.html`

3. Stop everything:

```bash
docker compose down
```

4. Stop and remove MongoDB data volume:

```bash
docker compose down -v
```

## Project Structure

- `server.js`
- `models/User.js`
- `models/GroupMessage.js`
- `models/PrivateMessage.js`
- `view/signup.html`
- `view/login.html`
- `view/chat.html`
- `public/app.js`
- `public/style.css`
