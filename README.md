# COMP3133 Lab Test 1 Chat Application

## Local Setup

1. Start MongoDB first.

2. Install dependencies:

```bash
npm install
```

3. Optional: set custom Mongo URI:

```bash
export MONGODB_URI="mongodb://127.0.0.1:27017/comp3133_lab_test_1"
```

4. Run the server:

```bash
npm start
```

5. Open:

`http://localhost:3000/view/signup.html`  
`http://localhost:3000/view/login.html`

## Docker Setup

1. Start app + MongoDB together:

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
