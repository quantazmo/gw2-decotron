# Make Your Own Changes

This project does not accept contributions or pull requests. To make your own changes, fork the repository on GitHub and work from your copy:

1. Click **Fork** on the [repository page](https://github.com/quantazmo/gw2-decotron).
2. Clone your fork and enter the project directory:

	```bash
	git clone https://github.com/<your-username>/gw2-decotron.git
	cd gw2-decotron
	```

3. Install dependencies and create a branch for your changes:

	```bash
	npm install
	git switch -c my-change
	```

4. Make and verify your changes:

	```bash
	npm run dev
	npm test
	npm run build
	```

5. Commit and push your branch to your fork:

	```bash
	git add .
	git commit -m "Describe your change"
	git push -u origin my-change
	```

Your changes stay in your fork. You can continue making changes by creating additional branches or committing directly to your fork.
