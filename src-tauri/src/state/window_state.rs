use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

pub struct WindowState {
    pub create_project_open: Arc<AtomicBool>,
}

impl WindowState {
    pub fn new() -> Self {
        Self {
            create_project_open: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_open(&self) -> bool {
        self.create_project_open.load(Ordering::Acquire)
    }

    pub fn set_open(&self, value: bool) {
        self.create_project_open.store(value, Ordering::Release);
    }
}