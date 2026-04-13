#[derive(Debug)]
pub struct KnitPattern {
    pub rows: Vec<Vec<bool>>,
    pub width: usize,
    pub height: usize,
}