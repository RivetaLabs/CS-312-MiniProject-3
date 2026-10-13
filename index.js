import express from "express";
import pg from "pg";
import session from "express-session";

const app = express();
const port = 3000;
app.set("view engine", "ejs");

const db = new pg.Pool();

//middleware 
app.use(express.urlencoded({ extended: true }));
//css
app.use(express.static("public"));


app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax" }
}));

app.get("/signup", (req, res) => {
    res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
    if (!req.body) {
        return res.status(400).render("signup", { error: "Fill in every field." });
    }
    const user_id = req.body.user_id;
    const password = req.body.password;
    const name = req.body.name;

    if (typeof user_id !== "string" || typeof password !== "string" || typeof name !== "string" ||
        !user_id.trim() || !password.trim() || !name.trim() ||
        user_id.length > 255 || password.length > 255 || name.length > 255) {
        return res.status(400).render("signup", {
            error: "Fill in every field using 1 to 255 characters."
        });
    }

    const existing = await db.query(
        "SELECT user_id FROM users WHERE user_id = $1", [user_id.trim()]
    );
    if (existing.rowCount > 0) {
        return res.status(409).render("signup", { error: "That user ID is taken." });
    }


    await db.query(
        `INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)`,
        [user_id.trim(), password, name.trim()]
    );
    res.redirect("/signin");
});

app.get("/signin", (req, res) => {
    res.render("signin", { error: null });
});

app.post("/signin", async (req, res, next) => {
    if (!req.body) {
        return res.status(400).render("signin", { error: "Enter your user ID and password." });
    }
    const user_id = req.body.user_id;
    const password = req.body.password;
    if (typeof user_id !== "string" || typeof password !== "string") {
        return res.status(400).render("signin", { error: "Enter your user ID and password." });
    }
    const result = await db.query(
        "SELECT user_id, name FROM users WHERE user_id = $1 AND password = $2",
        [user_id.trim(), password]
    );
    if (result.rowCount === 0) {
        return res.status(401).render("signin", { error: "Incorrect user ID or password." });
    }
    req.session.regenerate(error => {
        if (error) return next(error);
        req.session.user = result.rows[0];
        res.redirect("/");
    });
});

app.use("/posts", (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/signin");
    }
    next();
});

app.get("/", async (req, res) => {
    const result = await db.query(
        "SELECT * FROM blogs ORDER BY date_created DESC"
    );

    res.render("home", { posts: result.rows, user: req.session.user });
}); 

app.post("/posts", async (req, res) => {
    if (!req.body) {
        return res.status(400).send("Enter a title and a post body.");
    }
    const title = req.body.title;
    const body = req.body.body;
    const category = req.body.category;
    if (typeof title !== "string" || !title.trim() || title.length > 255 ||
        typeof body !== "string" || !body.trim()) {
        return res.status(400).send("Enter a title of 1 to 255 characters and a post body.");
    }
    if (category !== "tech" && category !== "sports" && category !== "money-moves") {
        return res.status(400).send("Choose one of the listed categories.");
    }
    await db.query(
        `INSERT INTO blogs (creator_name, creator_user_id, title, body, category, date_created)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [req.session.user.name, req.session.user.user_id, title.trim(), body.trim(), category]
    );
    res.redirect("/");
});

app.get("/posts/:id/edit", async (req, res) => {
    const result = await db.query(
        "SELECT * FROM blogs WHERE blog_id = $1 AND creator_user_id = $2",
        [req.params.id, req.session.user.user_id]
    );
    if (result.rowCount === 0) {
        return res.status(404).send("Post not found or not yours.");
    }
    res.render("edit", { post: result.rows[0] });
});

app.post("/posts/:id/edit", async (req, res) => {
    if (!req.body) {
        return res.status(400).send("Enter a title and a post body.");
    }
    const title = req.body.title;
    const body = req.body.body;
    if (typeof title !== "string" || !title.trim() || title.length > 255 ||
        typeof body !== "string" || !body.trim()) {
        return res.status(400).send("Enter a title of 1 to 255 characters and a post body.");
    }
    const result = await db.query(
        `UPDATE blogs SET title = $1, body = $2
         WHERE blog_id = $3 AND creator_user_id = $4`,
        [title.trim(), body.trim(), req.params.id, req.session.user.user_id]
    );
    if (result.rowCount === 0) {
        return res.status(404).send("Post not found or not yours.");
    }
    res.redirect("/");
});

app.post("/posts/:id/delete", async (req, res) => {
    const result = await db.query(
        "DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2",
        [req.params.id, req.session.user.user_id]
    );
    if (result.rowCount === 0) {
        return res.status(404).send("Post not found or not yours.");
    }
    res.redirect("/");
});

app.listen(port, () => {
    console.log("Server is running on port " + port);
});
