import { AppBar, Button, Toolbar, Typography } from "@mui/material";

import { Link } from "react-router-dom";
import React from "react";

const NavBar = () => {
  return (
    <AppBar position="static" sx={{ backgroundColor: 'white', color: 'black' }}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Tactile Graphic Evaluation
        </Typography>
        <Button color="inherit" component={Link} to="/about" sx={{ color: 'black' }}>
          About
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default NavBar;
